// Response formatting configuration
const formatterTemplate = {
    format: `# {title}\n\n{answer}`,
    maxAnswerWords: 999999 // Effectively disable truncation to ensure complete responses
};

// Function to format the response based on the template
function formatResponse(question, answer) {
    const title = question.endsWith('?') ? question : question + '?';
    return formatterTemplate.format
        .replace('{title}', title)
        .replace('{answer}', answer);
}

// HTML escape function
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Convert markdown to HTML
function convertMarkdownToHTML(markdown) {
    const md = window.markdownit({
        html: true, // Enable HTML tags in source
        linkify: true, // Autoconvert URL-like text to links
        typographer: true, // Enable some language-neutral replacement + quotes beautification
        breaks: true // Convert '\n' in paragraphs into <br>
    });

    // Custom rule to handle code blocks with copy button
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const language = token.info.trim();
        const codeContent = token.content.trim();

        // Generate a unique ID for this code block
        const codeBlockId = 'code-block-' + Math.random().toString(36).substring(2, 9);

        // Escape HTML characters for display using our custom function
        let displayCode = escapeHtml(codeContent);

        // Determine if the language is supported by Prism, default to 'markup' if not specified or unknown
        const prismLanguage = language && window.Prism && window.Prism.languages[language] ? language : 'markup';

        // Highlight the code using Prism.js if available
        let highlightedCode = displayCode; // Default to escaped content
        if (window.Prism && window.Prism.languages[prismLanguage]) {
            try {
                highlightedCode = window.Prism.highlight(codeContent, window.Prism.languages[prismLanguage], prismLanguage);
            } catch (e) {
                console.warn(`Prism.js highlighting failed for language ${prismLanguage}:`, e);
            }
        }

        return `
            <div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-language">${language || 'code'}</span>
                    <button class="code-copy-btn" onclick="window.copyCodeBlock(this)">📋</button>
                </div>
                <pre><code id="${codeBlockId}" class="language-${prismLanguage}">${highlightedCode}</code></pre>
            </div>
        `;
    };

    // Custom rule for inline code to apply syntax highlighting
    md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const codeContent = token.content.trim();

        // Escape HTML characters for display
        let escapedCodeContent = escapeHtml(codeContent);

        // Apply specific styling for file extensions (e.g., .ts, .js, .json)
        escapedCodeContent = escapedCodeContent.replace(/\b(\.([a-z0-9]+))\b/gi, '<span class="file-extension">$1</span>');

        // Apply specific styling for numbers
        escapedCodeContent = escapedCodeContent.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');

        // Attempt to highlight inline code as JavaScript for common cases
        let highlightedInlineCode = escapedCodeContent; // Default to escaped content
        try {
            if (window.Prism && window.Prism.languages.javascript) {
                highlightedInlineCode = window.Prism.highlight(codeContent, window.Prism.languages.javascript, 'javascript');
            }
        } catch (e) {
            console.warn('Prism.js highlighting failed for inline code:', e);
        }

        // Re-apply custom spans on top of Prism highlighting or escaped content
        highlightedInlineCode = highlightedInlineCode.replace(/\b(\.([a-z0-9]+))\b/gi, '<span class="file-extension">$1</span>');
        highlightedInlineCode = highlightedInlineCode.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');

        return `<code class="inline-code">${highlightedInlineCode}</code>`;
    };

    // Custom rule for command blocks (similar to fence, but for command examples)
    md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const codeContent = token.content.trim();
        const language = token.info ? token.info.trim() : 'command'; // Default to 'command' if no language specified

        // Generate a unique ID for this command block
        const codeBlockId = 'command-block-' + Math.random().toString(36).substring(2, 9);

        // Escape HTML characters for display
        let displayCode = escapeHtml(codeContent);

        return `
            <div class="code-block-container command-block-container">
                <div class="code-block-header">
                    <span class="code-language">${language}</span>
                    <button class="code-copy-btn" onclick="window.copyCodeBlock(this)">📋</button>
                </div>
                <pre><code id="${codeBlockId}" class="language-none">${displayCode}</code></pre>
            </div>
        `;
    };

    // Render markdown to HTML using markdown-it
    let html = md.render(markdown);

    // === DARK MODE: Remove all inline background/background-color styles from code, span, and token elements ===
    if (typeof document !== 'undefined' && !document.documentElement.classList.contains('light-theme')) {
        // Create a temporary DOM element to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        // Remove background/background-color inline styles from all code, span, and token elements
        tempDiv.querySelectorAll('code, span, .token').forEach(el => {
            if (el.hasAttribute('style')) {
                // Remove only background and background-color from style attribute
                el.setAttribute('style', el.getAttribute('style').replace(/background(-color)?\s*:[^;]+;?/gi, ''));
                // If style is now empty, remove the attribute
                if (!el.getAttribute('style').trim()) el.removeAttribute('style');
            }
        });
        html = tempDiv.innerHTML;
    }

    // Process inline citations after markdown-it has rendered the HTML
    html = html.replace(/\[\[(\d+)\]\((.*?)\)\]/g, (match, sourceIndex, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-citation">[${sourceIndex}]</a>`;
    });

    return html.trim();
}

// Process and display response
window.processResponse = function(prompt, data) {
    try {
        window.showStopButton(); // Show stop button at the start of processing
        let htmlContent;

        if (data.imageUrl) {
            // If an image URL is present, create an image display with a download button
            htmlContent = `
                <div class="image-synthesis-container">
                    <img src="${data.imageUrl}" alt="Generated Image" class="generated-image">
                    <a href="${data.imageUrl}" download="generated_image.png" class="download-image-btn">
                        Download Image
                    </a>
                </div>
            `;
        } else {
            // Otherwise, format the text response as markdown
            const formattedResponse = formatResponse(
                prompt,
                data.answer
            );
            htmlContent = convertMarkdownToHTML(formattedResponse);
        }
        
        return htmlContent;
    } catch (error) {
        console.error('Error processing response:', error);
        return '<p>Error processing response. Please try again.</p>';
    }
}

// Initialize Prism.js after DOM is loaded
function initializePrism() {
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// --- CORRECTED Stop Button Logic ---
function showStopButton() {
    // Try both possible IDs to ensure compatibility
    const stopButton = document.getElementById('stop-btn') || document.getElementById('stop-button');
    if (stopButton) {
        stopButton.style.display = 'inline-flex';
    }
}

function hideStopButton() {
    const stopButton = document.getElementById('stop-btn') || document.getElementById('stop-button');
    if (stopButton) {
        stopButton.style.display = 'none';
    }
}

// Initialize stop button functionality when DOM is ready
function initializeStopButton() {
    const stopButton = document.getElementById('stop-btn') || document.getElementById('stop-button');
    if (stopButton) {
        stopButton.addEventListener('click', () => {
            console.log('Stop button clicked');
            if (window.currentRequest) {
                window.currentRequest.abort();
            }
            window.isGenerating = false;
            if (window.resetGenerationState) {
                window.resetGenerationState();
            }
            hideStopButton();
        });
        console.log('Stop button initialized');
    } else {
        // console.warn('Stop button not found during initialization'); // Commented out to avoid unnecessary warnings
    }
}

// Ensure DOM is loaded before attaching functions
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window !== 'undefined') {
        // Attach all formatter functions to window object for global access
        window.formatResponse = formatResponse; // Keep this if formatResponse is still needed
        window.convertMarkdownToHTML = convertMarkdownToHTML;
        window.escapeHtml = escapeHtml;
        window.processResponse = processResponse;
        window.showStopButton = showStopButton;
        window.hideStopButton = hideStopButton;
        window.initializePrism = initializePrism; // Expose initializePrism globally
        window.initializeStopButton = initializeStopButton; // Expose initializeStopButton globally

        // Initialize stop button and Prism.js when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeStopButton();
                initializePrism();
            });
        } else {
            initializeStopButton();
            initializePrism();
        }
        
        // Log successful loading
        console.log('Response formatter loaded successfully');
    }
});