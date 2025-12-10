// Main JavaScript file for AHL Training LMS

// API Base URL
const API_BASE = '/api';

// Ensure cookies are included on all fetch requests (same-origin)
// This helps keep users logged in across all pages and API calls
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(resource, init = {}) {
    const finalInit = {
      credentials: init.credentials || 'same-origin',
      ...init
    };
    return originalFetch(resource, finalInit);
  };
})();

// Utility Functions
class LMSUtils {
    // Make API calls
    static async apiCall(endpoint, options = {}) {
        try {
            const init = {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                credentials: options.credentials || 'same-origin'
            };

            if (options.body !== undefined) {
                init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
            }

            // Preserve any other options like signal, mode, etc.
            const response = await fetch(`${API_BASE}${endpoint}`, init);
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'API call failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    // Get current user
    static async getCurrentUser() {
        try {
            return await this.apiCall('/user');
        } catch (error) {
            // Redirect to login if not authenticated
            window.location.href = '/';
            return null;
        }
    }
    
    // Logout function
    static async logout() {
        try {
            await this.apiCall('/logout', { method: 'POST' });
            window.location.href = '/';
        } catch (error) {
            console.error('Logout failed:', error);
            // Force redirect anyway
            window.location.href = '/';
        }
    }
    
    // Format date
    static formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    // Show notification
    static showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 5px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        // Set background color based on type
        switch(type) {
            case 'success':
                notification.style.background = '#27ae60';
                break;
            case 'error':
                notification.style.background = '#e74c3c';
                break;
            case 'warning':
                notification.style.background = '#f39c12';
                break;
            default:
                notification.style.background = '#3498db';
        }
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    // Extract Gumlet video ID from URL
    static extractGumletId(url) {
        // Extract ID from Gumlet URLs like https://play.gumlet.io/embed/68411fb92ea48d13d446fb04
        const regExp = /.*gumlet\.io\/embed\/([a-zA-Z0-9]+)/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    }

    // Create Gumlet embed URL
    static createGumletEmbedUrl(videoId) {
        return `https://play.gumlet.io/embed/${videoId}`;
    }

    // Validate Gumlet URL
    static isValidGumletUrl(url) {
        return /^https:\/\/play\.gumlet\.io\/embed\/[a-zA-Z0-9]+$/.test(url);
    }
    
    // Validate email
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    // Validate phone number (Indian format)
    static validatePhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        // Accept 10-digit numbers (without country code) or 12-digit numbers starting with 91
        const tenDigitPattern = /^[6-9]\d{9}$/;
        const twelveDigitPattern = /^91[6-9]\d{9}$/;
        return tenDigitPattern.test(cleaned) || twelveDigitPattern.test(cleaned);
    }
    
    // Format phone number with Indian country code
    static formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        
        // If 10 digits starting with 6-9, add 91 prefix
        if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
            return '91' + cleaned;
        }
        // If 12 digits starting with 91, keep as is
        else if (cleaned.length === 12 && cleaned.startsWith('91')) {
            return cleaned;
        }
        // If 11 digits starting with 1 (user typed 91 but missed a digit), assume they meant 91
        else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return '9' + cleaned;
        }
        // Return original if doesn't match expected patterns
        return cleaned;
    }
    
    // Auto-format phone input as user types
    static setupPhoneFormatting(inputElement) {
        inputElement.addEventListener('input', function(e) {
            const cursorPosition = e.target.selectionStart;
            const oldValue = e.target.value;
            const cleaned = oldValue.replace(/\D/g, '');
            
            let formatted = '';
            if (cleaned.length <= 12) {
                // Add +91 prefix for display
                if (cleaned.length > 0) {
                    if (cleaned.startsWith('91') && cleaned.length > 2) {
                        formatted = '+91 ' + cleaned.substring(2);
                    } else if (!cleaned.startsWith('91') && cleaned.length <= 10) {
                        formatted = '+91 ' + cleaned;
                    } else {
                        formatted = '+' + cleaned;
                    }
                }
            } else {
                formatted = oldValue; // Don't allow more than 12 digits
            }
            
            e.target.value = formatted;
            
            // Restore cursor position
            const newCursorPosition = cursorPosition + (formatted.length - oldValue.length);
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);
        });
        
        // Clean up on blur to store clean number
        inputElement.addEventListener('blur', function(e) {
            const cleaned = e.target.value.replace(/\D/g, '');
            const formatted = LMSUtils.formatPhone(cleaned);
            // Store the clean formatted number (with 91 prefix)
            e.target.dataset.cleanValue = formatted;
        });
    }
    
    // Calculate progress percentage
    static calculateProgress(completed, total) {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100);
    }
    
    // Create progress bar HTML
    static createProgressBar(percentage, label = '') {
        return `
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-text">${label} ${percentage}%</div>
        `;
    }
    
    // Create status badge HTML
    static createStatusBadge(status) {
        const statusClass = `status-${status.toLowerCase()}`;
        return `<span class="status-badge ${statusClass}">${status}</span>`;
    }
    
    // Debounce function
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Loading spinner
    static showLoading(element) {
        element.innerHTML = '<div class="loading-spinner">Loading...</div>';
        element.style.opacity = '0.6';
    }
    
    static hideLoading(element) {
        element.style.opacity = '1';
    }
}

// Common DOM manipulation functions
class DOMUtils {
    // Create element with attributes
    static createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        if (content) {
            element.innerHTML = content;
        }
        
        return element;
    }
    
    // Clear element content
    static clearElement(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
    
    // Show/hide elements
    static show(element) {
        element.style.display = 'block';
    }
    
    static hide(element) {
        element.style.display = 'none';
    }
    
    static toggle(element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

// Form validation utilities
class FormValidator {
    static validateForm(formData, rules) {
        const errors = [];
        
        Object.keys(rules).forEach(field => {
            const value = formData[field];
            const rule = rules[field];
            
            // Required validation
            if (rule.required && (!value || value.trim() === '')) {
                errors.push(`${rule.label || field} is required`);
                return;
            }
            
            // Skip other validations if field is empty and not required
            if (!value || value.trim() === '') return;
            
            // Email validation
            if (rule.type === 'email' && !LMSUtils.validateEmail(value)) {
                errors.push(`${rule.label || field} must be a valid email`);
            }
            
            // Phone validation
            if (rule.type === 'phone' && !LMSUtils.validatePhone(value)) {
                errors.push(`${rule.label || field} must be a valid phone number`);
            }
            
            // Minimum length validation
            if (rule.minLength && value.length < rule.minLength) {
                errors.push(`${rule.label || field} must be at least ${rule.minLength} characters`);
            }
            
            // Maximum length validation
            if (rule.maxLength && value.length > rule.maxLength) {
                errors.push(`${rule.label || field} must be no more than ${rule.maxLength} characters`);
            }
        });
        
        return errors;
    }
    
    static showFormErrors(errors, container) {
        DOMUtils.clearElement(container);
        
        if (errors.length > 0) {
            const errorList = DOMUtils.createElement('ul', { className: 'error-list' });
            
            errors.forEach(error => {
                const errorItem = DOMUtils.createElement('li', {}, error);
                errorList.appendChild(errorItem);
            });
            
            container.appendChild(errorList);
            DOMUtils.show(container);
        } else {
            DOMUtils.hide(container);
        }
    }
}

// Create logout confirmation modal
function createLogoutModal() {
    const modalHTML = `
        <div id="logoutModal" class="modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Confirm Logout</h3>
                    <button class="close" data-action="close-logout-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Are you sure you want to logout? You will be redirected to the login page.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="close-logout-modal">Cancel</button>
                    <button class="btn btn-danger" data-action="confirm-logout">Logout</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body if it doesn't exist
    if (!document.getElementById('logoutModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
}

// Show logout modal
function showLogoutModal() {
    createLogoutModal();
    document.getElementById('logoutModal').style.display = 'flex';
}

// Close logout modal
function closeLogoutModal() {
    document.getElementById('logoutModal').style.display = 'none';
}

// Confirm logout action
function confirmLogout() {
    closeLogoutModal();
    LMSUtils.logout();
}

// Initialize common functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add logout functionality to logout buttons
    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showLogoutModal();
        });
    });
    
    // Add active class to current navigation item
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    // CSP-safe delegation for logout modal controls
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        if (action === 'close-logout-modal') {
            e.preventDefault();
            closeLogoutModal();
        } else if (action === 'confirm-logout') {
            e.preventDefault();
            confirmLogout();
        }
    });
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .loading-spinner {
        text-align: center;
        padding: 2rem;
        color: #666;
    }
    
    .error-list {
        list-style: none;
        padding: 0;
    }
    
    .error-list li {
        background: #fee;
        color: #c33;
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        border-radius: 3px;
        border: 1px solid #fcc;
    }
`;
document.head.appendChild(style);

// Export utilities for use in other files
window.LMSUtils = LMSUtils;
window.DOMUtils = DOMUtils;
window.FormValidator = FormValidator;
