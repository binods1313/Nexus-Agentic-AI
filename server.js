// server.js
const express = require('express');
const FormData = require('form-data');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const ExcelJS = require('exceljs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// === MIDDLEWARE SETUP (Correct Order) ===
// 1. CORS configuration - Enable for all origins in development
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['http://localhost:3000', 'http://localhost:3001'] 
        : true, // Allow all origins in development
    credentials: true
}));

// 2. JSON and URL-encoded parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Rate limiting for API routes only
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting only to API routes
app.use('/api/', apiLimiter);

// === DIRECTORY VERIFICATION ===
const fs = require('fs');
const publicPath = path.join(__dirname, 'public');

console.log(`📁 Serving static files from: ${publicPath}`);

console.log('🔍 Verifying public directory structure...');
try {
    const files = fs.readdirSync(publicPath);
    console.log('📂 Files in public directory:', files);
    
    const requiredFiles = ['index.html', 'response-styles.css', 'response-formatter.js'];
    const missingFiles = [];
    
    requiredFiles.forEach(file => {
        const filePath = path.join(publicPath, file);
        const exists = fs.existsSync(filePath);
        console.log(`   ${file}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
        if (!exists) missingFiles.push(file);
    });
    
    if (missingFiles.length > 0) {
        console.warn(`⚠️  Missing required files: ${missingFiles.join(', ')}`);
    }
} catch (error) {
    console.error('❌ Error reading public directory:', error.message);
}


// 4. General static file serving (after specific file handlers)
app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Set proper MIME types for any remaining files
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
    }
}));

// === FILE UPLOAD CONFIGURATION ===
const upload = multer({
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 20 // Maximum 20 files
    },
    fileFilter: (req, file, cb) => {
        // For images, only accept PNG, JPG, JPEG
        if (file.fieldname === 'images') {
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only PNG, JPG and JPEG files are allowed for images'));
            }
        }
        // For documents
        else if (file.fieldname === 'documents') {
            const allowedDoc = [
                'text/csv',
                'application/json',
                'text/plain',
                'application/pdf',
                'application/vnd.ms-excel', // .xls
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
            ];
            if (allowedDoc.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Unsupported document type. Supported: CSV, JSON, TXT, PDF, XLS, XLSX'));
            }
        } else {
            cb(new Error('Invalid field name. Use "images" or "documents"'));
        }
    }
});

// === AI MODEL INTEGRATION ===
async function callGeminiAPI(query, type, userPrompt, signal) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('Gemini API key not set in environment variables');
    }
    
    // Base prompt template
    const basePrompt = `You are a knowledgeable and helpful assistant that can answer any questions. Your task is to provide comprehensive and accurate answers. The information provided below contains the necessary context to answer the question effectively.`;
    
    // Customize prompt based on type
    let enhancedQuery = '';
    switch(type) {
        case 'code':
            enhancedQuery = `${basePrompt}\n\nTechnical Question: ${query}\n\nPlease provide a detailed code solution with explanations. Format code blocks properly using markdown triple backticks and include line-by-line explanations where helpful. Focus on best practices and maintainable code.`;
            break;
        case 'science':
            enhancedQuery = `${basePrompt}\n\nScientific Question: ${query}\n\nPlease explain in detail, including relevant scientific principles, current research, and practical applications. Use clear, accessible language while maintaining scientific accuracy.`;
            break;
        case 'data':
            enhancedQuery = `You are a data analysis expert. You have been provided with structured data from files that have been processed and extracted. Here is the data and analysis request:\n\n${query}\n\nPlease analyze the data provided above and answer any questions accurately. Focus on providing specific numerical answers, identifying patterns, trends, and giving clear explanations based on the data structure shown. The data has been successfully extracted from the uploaded files and is ready for analysis.`;
            break;
        case 'images':
            enhancedQuery = `${basePrompt}\n\nImage Analysis Request: ${query}\n\nPlease provide a detailed description and analysis, including visual concepts, design suggestions, and creative recommendations based on the image content.`;
            break;
        case 'document_analysis':
            enhancedQuery = `You have been provided with document content below. This is the complete content of the document. Your task is to answer the user's question based SOLELY on the provided document content.\n\nDocument Content:\n${query}\n\nUser's Question: ${userPrompt}\n\nAnswer the user's question using ONLY the document content provided above. Provide specific details and quotes where relevant.`;
            break;
        default:
            enhancedQuery = `${basePrompt}\n\nGeneral Question: ${query}\n\nPlease provide a comprehensive and helpful answer to this question. Include relevant context, examples, and practical advice where appropriate.`;
            break;
    }
    
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
            {
                contents: [{ parts: [{ text: enhancedQuery }] }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 4096,
                    stopSequences: []
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000, // 30 second timeout
                signal: signal // Pass the AbortSignal to the axios request
            }
        );
        
        if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from Gemini API');
        }
        
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API Error:', error.response?.data || error.message);
        throw new Error(`AI processing failed: ${error.message}`);
    }
}

// Enhanced Gemini Vision for image analysis
async function analyzeImageWithGeminiVision(imageBuffer, originalname, userPrompt, mimeType) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('Gemini API key not set in environment variables');
    }
    
    const base64Image = imageBuffer.toString('base64');
    
    const enhancedPrompt = `You are a UI/UX expert and web design analyst. Analyze this uploaded image in detail, focusing on the ACTUAL VISUAL ELEMENTS you can observe.

**ANALYSIS REQUIREMENTS:**
- Base your analysis STRICTLY on what you can see in the uploaded image
- Do NOT provide generic advice - focus on specific visual elements
- Describe layout, colors, typography, spacing, and interactive elements
- Identify usability issues and suggest targeted improvements

**Focus Areas:**
1. **Visual Design:** Color scheme, typography, visual hierarchy, spacing
2. **User Interface:** Navigation, buttons, forms, interactive elements
3. **Accessibility:** Contrast, text size, touch targets
4. **User Experience:** Flow, clarity, functionality

**User's Specific Request:** ${userPrompt || 'Provide a comprehensive UI/UX analysis of this interface'}

**Response Format:**
1. **Visual Elements Observed:** Describe what you can see in the image
2. **Specific Recommendations:** Targeted suggestions based on the actual interface
3. **Priority Issues:** Most critical problems to address
4. **Implementation Notes:** Actionable steps for improvement

Focus on the ACTUAL CONTENT of this specific screenshot, not general design principles.`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
            {
                contents: [{
                    parts: [
                        { text: enhancedPrompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 3072
                }
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 45000 // 45 second timeout for image analysis
            }
        );
        
        if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from Gemini Vision API');
        }
        
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini Vision Error:', error.response?.data || error.message);
        throw new Error(`Image analysis failed: ${error.message}`);
    }
}

// === API ENDPOINTS ===

// Root endpoint - serves index.html
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <h1>Welcome to AI Assistant Server</h1>
            <p>Server is running, but index.html not found in public directory.</p>
            <p>Expected location: ${indexPath}</p>
            <p>Please ensure your index.html file is in the public folder.</p>
        `);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Server is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            root: 'http://localhost:' + PORT,
            health: 'http://localhost:' + PORT + '/health',
            ai: 'http://localhost:' + PORT + '/api/ai',
            upload: 'http://localhost:' + PORT + '/api/ai-upload',
            images: 'http://localhost:' + PORT + '/api/generate-image'
        }
    });
});

// AI Chat endpoint
app.post('/api/ai', [
    body('query').isLength({ min: 1, max: 2000 }).trim(),
    body('type').isIn(['general', 'code', 'science', 'images', 'data']),
    body('model').optional().isIn(['gemini', 'claude'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { query, type = 'general', model = 'gemini' } = req.body;
        
        if (!query?.trim()) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`🤖 Processing ${type} query with ${model}:`, query.substring(0, 100) + '...');
        
        let result;
        if (model === 'claude') {
            // Placeholder for future Claude integration
            result = `Claude API integration coming soon. Your query: "${query}" (type: ${type})`;
        } else {
            result = await callGeminiAPI(query, type);
        }
        
        res.json({ 
            result,
            model: model,
            type: type,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('AI API Error:', error);
        res.status(500).json({ 
            error: 'Error processing your request',
            details: error.message,
            type: 'ai_processing_error'
        });
    }
});

// File upload AI endpoint
app.post('/api/ai-upload', upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'documents', maxCount: 10 }
]), async (req, res) => {
    try {
        const images = req.files?.['images'] || [];
        const documents = req.files?.['documents'] || [];
        const userPrompt = req.body.userPrompt?.trim() || '';
        
        console.log('📁 Upload received:', {
            imageCount: images.length,
            documentCount: documents.length,
            userPrompt: userPrompt.substring(0, 100) + '...'
        });
        
        if (images.length === 0 && documents.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        let summary = '';
        
        // Process images with enhanced analysis
        if (images.length > 0) {
            try {
                console.log('🖼️  Processing image:', images[0].originalname);
                const aiResult = await analyzeImageWithGeminiVision(
                    images[0].buffer, 
                    images[0].originalname, 
                    userPrompt, 
                    images[0].mimetype
                );
                summary += `**Enhanced UI/UX Analysis for ${images[0].originalname}:**\n${aiResult}\n\n`;
                
                if (images.length > 1) {
                    summary += `**Note:** ${images.length - 1} additional images were uploaded. Each can be analyzed individually upon request.\n\n`;
                }
            } catch (visionError) {
                console.error('Vision analysis error:', visionError);
                return res.status(500).json({ 
                    error: 'Image analysis failed', 
                    details: visionError.message,
                    type: 'image_analysis_error'
                });
            }
        }
        
        // Process documents
        for (const doc of documents) {
            try {
                console.log('📄 Processing document:', doc.originalname, 'Type:', doc.mimetype);
                
                if (doc.mimetype.includes('spreadsheet') || doc.mimetype.includes('excel')) {
                    // Excel processing
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(doc.buffer);
                    let excelContent = `FILE: ${doc.originalname}\n=== EXCEL FILE ANALYSIS ===\n`;
                    
                    workbook.eachSheet((sheet, sheetId) => {
                        excelContent += `\n--- SHEET: ${sheet.name} ---\n`;
                        
                        const headerRow = sheet.getRow(1);
                        let headers = [];
                        if (headerRow?.values) {
                            headers = headerRow.values.slice(1).filter(v => v != null);
                            excelContent += `COLUMNS (${headers.length}): ${headers.join(' | ')}\n\n`;
                        }
                        
                        // Sample data (first 10 rows)
                        excelContent += `SAMPLE DATA:\n`;
                        let rowCount = 0;
                        sheet.eachRow((row, rowNumber) => {
                            if (rowCount < 10 && rowNumber > 1) {
                                const values = row.values?.slice(1).filter(v => v != null) || [];
                                if (values.length > 0) {
                                    excelContent += `Row ${rowNumber}: ${values.join(' | ')}\n`;
                                }
                                rowCount++;
                            }
                        });
                        excelContent += `\nTotal rows: ${sheet.rowCount}\n`;
                    });
                    
                    const excelPrompt = `${excelContent}\n\nUSER QUESTION: ${userPrompt}\n\nAnalyze the Excel data and answer the user's question.`;
                    const aiResult = await callGeminiAPI(excelPrompt, 'data', userPrompt);
                    summary += `**Excel Analysis for ${doc.originalname}:**\n${aiResult}\n\n`;
                    
                } else if (doc.mimetype === 'text/csv') {
                    // CSV processing
                    const csvContent = doc.buffer.toString('utf8');
                    const lines = csvContent.split('\n').filter(line => line.trim());
                    const headers = lines[0]?.split(',') || [];
                    
                    let processedCsv = `FILE: ${doc.originalname}\n=== CSV FILE ANALYSIS ===\n`;
                    processedCsv += `COLUMNS (${headers.length}): ${headers.join(' | ')}\n\n`;
                    processedCsv += `SAMPLE DATA:\n`;
                    
                    for (let i = 0; i < Math.min(10, lines.length); i++) {
                        if (lines[i]?.trim()) {
                            processedCsv += `Row ${i + 1}: ${lines[i]}\n`;
                        }
                    }
                    processedCsv += `\nTotal rows: ${lines.length}\n\nUSER QUESTION: ${userPrompt}`;
                    
                    const aiResult = await callGeminiAPI(processedCsv, 'data', userPrompt);
                    summary += `**CSV Analysis for ${doc.originalname}:**\n${aiResult}\n\n`;
                    
                } else if (doc.mimetype.startsWith('text/') || doc.mimetype === 'application/json') {
                    // Text-based documents
                    const textContent = doc.buffer.toString('utf8');
                    let processedText = `FILE: ${doc.originalname}\n=== DOCUMENT ANALYSIS ===\n`;
                    processedText += `SIZE: ${doc.size} bytes\n`;
                    processedText += `CONTENT:\n${textContent.substring(0, 3000)}...\n\n`;
                    
                    const aiResult = await callGeminiAPI(processedText, 'document_analysis', userPrompt);
                    summary += `**Document Analysis for ${doc.originalname}:**\n${aiResult}\n\n`;
                }
                
            } catch (docError) {
                console.error(`Document processing error for ${doc.originalname}:`, docError);
                summary += `**Error processing ${doc.originalname}:** ${docError.message}\n\n`;
            }
        }
        
        res.json({ 
            result: summary,
            processed: {
                images: images.length,
                documents: documents.length
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Upload processing error:', error);
        res.status(500).json({
            error: 'File processing failed',
            details: error.message,
            type: 'upload_processing_error'
        });
    }
});

// Image generation endpoint
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt?.trim() || prompt.trim().length < 3) {
            return res.status(400).json({
                error: 'Prompt is required and must be at least 3 characters long',
                received: prompt
            });
        }

        const stabilityApiKey = process.env.STABILITY_API_KEY;
        if (!stabilityApiKey) {
            return res.status(500).json({
                error: 'Stability AI API key not configured. Please set STABILITY_API_KEY in environment variables.'
            });
        }

        console.log('🎨 Generating image for prompt:', prompt.substring(0, 50) + '...');
        
        // Try v2beta API first
        try {
            const response = await axios.post(
                'https://api.stability.ai/v2beta/stable-image/generate/ultra',
                {
                    prompt: prompt.trim(),
                    output_format: 'png',
                    aspect_ratio: '1:1'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${stabilityApiKey}`,
                        'Accept': 'image/*'
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000
                }
            );

            const imageBuffer = Buffer.from(response.data);
            const base64Image = imageBuffer.toString('base64');
            const imageUrl = `data:image/png;base64,${base64Image}`;
            
            console.log('✅ Image generated successfully with v2beta API');
            return res.json({
                imageUrl,
                prompt: prompt.trim(),
                success: true,
                api_version: 'v2beta',
                timestamp: new Date().toISOString()
            });

        } catch (v2Error) {
            console.log('v2beta API failed, trying v1 fallback...');
            
            // Fallback to v1 API
            const response = await axios.post(
                'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
                {
                    text_prompts: [{ text: prompt.trim(), weight: 1 }],
                    cfg_scale: 7,
                    height: 1024,
                    width: 1024,
                    samples: 1,
                    steps: 30,
                    style_preset: "photographic"
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${stabilityApiKey}`,
                        'Accept': 'application/json'
                    },
                    timeout: 60000
                }
            );

            if (!response.data?.artifacts?.[0]?.base64) {
                throw new Error('No image data returned from Stability AI');
            }

            const imageUrl = `data:image/png;base64,${response.data.artifacts[0].base64}`;
            
            console.log('✅ Image generated successfully with v1 fallback');
            return res.json({
                imageUrl,
                prompt: prompt.trim(),
                success: true,
                api_version: 'v1',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Image generation error:', error.message);
        if (error.response) {
            console.error('Stability AI API Response Error:', error.response.status, error.response.data);
            if (error.response.status === 401) {
                return res.status(401).json({ error: 'Invalid Stability AI API key. Please check your .env file.' });
            } else if (error.response.status === 429) {
                return res.status(429).json({ error: 'Stability AI API rate limit exceeded. Please wait and try again.' });
            } else if (error.response.status >= 500) {
                return res.status(500).json({ error: 'Stability AI API server error. Please try again later.' });
            } else {
                return res.status(error.response.status).json({ error: error.response.data?.message || 'Stability AI API error', details: error.response.data });
            }
        } else if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Image generation request timed out. The Stability AI API took too long to respond.' });
        } else if (error.code === 'ENOTFOUND' || error.code === 'ERR_NETWORK') {
            return res.status(503).json({ error: 'Network error connecting to Stability AI API. Please check your internet connection or API endpoint.' });
        } else {
            return res.status(500).json({ error: 'An unexpected error occurred during image generation.', details: error.message });
        }
    }
});

app.post('/api/test-stability-ai', async (req, res) => {
    try {
        const { prompt, aspectRatio } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const stabilityApiKey = process.env.STABILITY_API_KEY;
        if (!stabilityApiKey) {
            return res.status(500).json({ error: 'Stability AI API key not set' });
        }

        const API_URL = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';

        const headers = {
            'Accept': 'image/*',
            'Authorization': `Bearer ${stabilityApiKey}`
        }

        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('output_format', 'webp');
        if (aspectRatio) {
            formData.append('aspect_ratio', aspectRatio);
        }

        const response = await axios.post(API_URL, formData, {
            headers: headers,
            responseType: 'arraybuffer' // Important for image data
        });

        // Set the content type to image/webp
        res.setHeader('Content-Type', 'image/webp');
        res.send(response.data);

    } catch (error) {
        console.error('Stability AI API Error:', error.response?.data ? Buffer.from(error.response.data).toString('utf8') : error.message);
        res.status(500).json({
            error: 'Error generating image with Stability AI',
            details: error.response?.data ? Buffer.from(error.response.data).toString('utf8') : error.message,
            type: 'stability_ai_error'
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
        }
    }
    
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// *** CRITICAL: SPA Catch-all route MUST be the absolute last route ***
app.get('*', (req, res) => {
    // Don't interfere with API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // Don't interfere with static files we're explicitly serving
    if (req.path.includes('.js') || req.path.includes('.css') || req.path.includes('.html') || req.path.includes('.json') || req.path.includes('.')) {
        // If it's a request for a file type that should be static, and it wasn't found by express.static,
        // then it's a 404, not index.html.
        return res.status(404).send('File not found');
    }

    res.sendFile(path.join(publicPath, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});