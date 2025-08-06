
// Response formatting configuration
const formatterTemplate = {
    format: `# {title}\n\n{answer}`,
    maxAnswerWords: 999999 // Effectively disable truncation to ensure complete responses
};

// Format response according to template
function formatResponse(question, answer) {
    const title = question.endsWith('?') ? question : question + '?';
    return formatterTemplate.format
        .replace('{title}', title)
        .replace('{answer}', answer);
}

// Add inline citations to text
function addInlineCitation(text, sourceIndex, url) {
    return `${text} [[${sourceIndex}](${url})]`;
}


// Convert markdown to HTML
function convertMarkdownToHTML(markdown) {
    // Clean up markdown first - remove extra spaces and normalize line breaks
    markdown = markdown.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Process code blocks first
    let html = markdown.replace(/```([\s\S]*?)```/g, function(match, code) {
        // Check if the code block has a language specified
        const firstLineBreak = code.indexOf('\n');
        let language = '';
        let codeContent = code;
        
        if (firstLineBreak > 0) {
            language = code.substring(0, firstLineBreak).trim();
            codeContent = code.substring(firstLineBreak + 1);
        }
        
        // Clean up code content - remove leading/trailing empty lines but preserve internal structure
        codeContent = codeContent.replace(/^\n+/, '').replace(/\n+$/, '');
        
        // Generate a unique ID for this code block
        const codeBlockId = 'code-block-' + Math.random().toString(36).substring(2, 9);
        
        // Store the original code content exactly as it appears (with proper formatting)
        const originalCode = codeContent;
        
        // Escape HTML characters for display
        let formattedCode = codeContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
            
        // Apply syntax highlighting for JavaScript
        if (language.toLowerCase() === 'javascript' || language.toLowerCase() === 'js') {
            formattedCode = formattedCode
                .replace(/\b(let|const|var|function|return|if|else|for|while|switch|case|break|continue|new|this|class|import|export|from|try|catch|throw|async|await|typeof|instanceof)\b/g, '<span class="js-keyword">$1</span>')
                .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, '<span class="js-function">$1</span>')
                .replace(/(\/\/.*$)/gm, '<span class="js-comment">$1</span>')
                .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="js-comment">$1</span>')
                .replace(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="js-string">$&</span>')
                .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="js-number">$1</span>');
        }
        
        // Apply syntax highlighting for Python
        if (language.toLowerCase() === 'python' || language.toLowerCase() === 'py') {
            formattedCode = formattedCode
                .replace(/\b(def|class|if|elif|else|for|while|try|except|finally|with|import|from|as|return|yield|break|continue|pass|lambda|and|or|not|in|is|True|False|None|async|await)\b/g, '<span class="py-keyword">$1</span>')
                .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, '<span class="py-function">$1</span>')
                .replace(/(#.*$)/gm, '<span class="py-comment">$1</span>')
                .replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span class="py-docstring">$1</span>')
                .replace(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="py-string">$&</span>')
                .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="py-number">$1</span>');
        }
        
        // Apply syntax highlighting for HTML
        if (language.toLowerCase() === 'html' || language.toLowerCase() === 'xml') {
            formattedCode = formattedCode
                .replace(/(&lt;\/?[a-zA-Z][^&gt;]*&gt;)/g, '<span class="html-tag">$1</span>')
                .replace(/\b([a-zA-Z-]+)(?==)/g, '<span class="html-attribute">$1</span>')
                .replace(/(=['"`][^'"`]*['"`])/g, '<span class="html-value">$1</span>');
        }
        
        // Apply syntax highlighting for CSS
        if (language.toLowerCase() === 'css') {
            formattedCode = formattedCode
                .replace(/([.#]?[a-zA-Z][a-zA-Z0-9-_]*)\s*\{/g, '<span class="css-selector">$1</span> {')
                .replace(/([a-zA-Z-]+)\s*:/g, '<span class="css-property">$1</span>:')
                .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="css-comment">$1</span>')
                .replace(/(:)(\s*[^;]+)(;)/g, '$1<span class="css-value">$2</span>$3');
        }
        
        // Store original code in a way that preserves all formatting
        const encodedOriginalCode = btoa(unescape(encodeURIComponent(originalCode)));
        
        // Add copy button for this specific code block
        return `
            <div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-language">${language || 'code'}</span>
                    <button class="copy-code-button" onclick="copyCodeBlock('${codeBlockId}')" data-tooltip="Copy code">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy
                    </button>
                </div>
                <pre><code id="${codeBlockId}" class="language-${language}" data-original-code="${encodedOriginalCode}">${formattedCode}</code></pre>
            </div>
        `;
    });
    
    // Process inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Process other markdown elements and clean up spacing
    html = html
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n\n+/g, '</p><p>') // Convert double line breaks to paragraph breaks
        .replace(/\n/g, '<br>') // Convert single line breaks to <br>
        .replace(/^(.*)$/, '<p>$1</p>') // Wrap in paragraph tags
        .replace(/<p><\/p>/g, '') // Remove empty paragraphs
        .replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, '$1') // Remove paragraph tags around headers
        .replace(/<p>(<div.*?<\/div>)<\/p>/g, '$1') // Remove paragraph tags around divs
        .trim(); // Remove leading/trailing whitespace
    
    return html;
}

// Process and display response
async function processResponse(query, aiResponse) {
    const formattedResponse = formatResponse(
        query,
        aiResponse.answer
    );
    
    const htmlResponse = convertMarkdownToHTML(formattedResponse);
    
    // Clean up the final HTML output - remove extra spaces and normalize
    return htmlResponse.trim().replace(/\s+/g, ' ').replace(/>\s+</g, '><');
}

// Function to copy a specific code block with preserved formatting
function copyCodeBlock(codeBlockId) {
    const codeBlock = document.getElementById(codeBlockId);
    if (!codeBlock) return;
    
    try {
        // Decode the original code that was stored with proper formatting
        const encodedCode = codeBlock.dataset.originalCode;
        const textToCopy = decodeURIComponent(escape(atob(encodedCode)));
        
        // Use the modern clipboard API to copy the text with preserved formatting
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                // Show a temporary success message
                const button = document.querySelector(`button[onclick="copyCodeBlock('${codeBlockId}')"]`);
                if (button) {
                    const originalText = button.innerHTML;
                    button.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20,6 9,17 4,12"></polyline>
                        </svg>
                        Copied!
                    `;
                    button.style.color = '#10b981';
                    button.style.borderColor = '#10b981';
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        button.style.color = '';
                        button.style.borderColor = '';
                    }, 2000);
                }
            })
            .catch(err => {
                console.error('Failed to copy code:', err);
                // Fallback method for older browsers
                fallbackCopyTextToClipboard(textToCopy, codeBlockId);
            });
    } catch (error) {
        console.error('Failed to decode code:', error);
    }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text, codeBlockId) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Make the textarea out of viewport
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            const button = document.querySelector(`button[onclick="copyCodeBlock('${codeBlockId}')"]`);
            if (button) {
                const originalText = button.innerHTML;
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    Copied!
                `;
                button.style.color = '#10b981';
                button.style.borderColor = '#10b981';
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.color = '';
                    button.style.borderColor = '';
                }, 2000);
            }
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

// Attach all formatter functions to window object for global access
window.formatResponse = formatResponse;
window.convertMarkdownToHTML = convertMarkdownToHTML;
window.addInlineCitation = addInlineCitation;
window.processResponse = processResponse;
window.copyCodeBlock = copyCodeBlock;