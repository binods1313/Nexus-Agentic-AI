// Code Copy Button Functionality

// Global function to handle copying code from a block
window.copyCodeBlock = async function(button) {
    const codeBlockContainer = button.closest('.code-block-container');
    if (!codeBlockContainer) return;

    // Find the actual code element within the container
    const codeBlock = codeBlockContainer.querySelector('pre code');
    if (!codeBlock) return;

    const codeToCopy = codeBlock.innerText;

    try {
        await navigator.clipboard.writeText(codeToCopy);
        window.showCopySuccess(button);
    } catch (e) {
        // Fallback for older browsers
        window.fallbackCopyTextToClipboard(codeToCopy, button);
    }
};

// Function to show copy success feedback
window.showCopySuccess = function(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '&#10003; Copied!'; // Checkmark and Copied!
    button.classList.add('copied');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('copied');
    }, 1200);
};

// Fallback for copying text to clipboard for older browsers
window.fallbackCopyTextToClipboard = function(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; // Avoid scrolling to bottom
    textarea.style.left = '-9999px'; // Move off-screen
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        document.execCommand('copy');
        window.showCopySuccess(button);
    } catch (err) {
        console.error('Fallback: Copy command failed', err);
    }
    document.body.removeChild(textarea);
};

// Function to add copy buttons to all pre code blocks
window.addCopyButtons = function() {
    document.querySelectorAll('pre code').forEach(codeBlock => {
        if (!codeBlock.closest('.code-block-container')) {
            const container = document.createElement('div');
            container.className = 'code-block-container';
            codeBlock.parentNode.insertBefore(container, codeBlock);
            container.appendChild(codeBlock);

            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.type = 'button';
            button.innerHTML = '<img src="/assets/copy.svg" alt="Copy" class="copy-icon">';
            // Directly attach the event listener
            button.addEventListener('click', () => window.copyCodeBlock(button));
            container.insertBefore(button, codeBlock);
        }
    }); // <-- Close forEach properly
    console.log('Copy buttons added to code blocks.');
};

// Initialize copy buttons when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', window.addCopyButtons);

// Re-add copy buttons when new content is added to the DOM
// This replaces the previous MutationObserver logic for efficiency
// The 'delegation' pattern is implicitly handled by re-running addCopyButtons
// on dynamic content, ensuring new elements get buttons.
// This assumes addCopyButtons can be safely called multiple times.

console.log('Code copy functionality initialized');
