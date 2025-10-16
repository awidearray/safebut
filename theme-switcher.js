// Theme Switcher JavaScript Module

class ThemeSwitcher {
    constructor() {
        this.currentTheme = this.loadTheme();
        this.init();
    }

    init() {
        // Apply saved theme on load
        this.applyTheme(this.currentTheme);
        
        // Create theme switcher UI if it doesn't exist
        this.createThemeSwitcher();
        
        // Listen for theme preference changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'safematernity-theme') {
                this.currentTheme = e.newValue || 'neutral';
                this.applyTheme(this.currentTheme);
                this.updateThemeSwitcherUI();
            }
        });
    }

    loadTheme() {
        // Check localStorage first
        const savedTheme = localStorage.getItem('safematernity-theme');
        if (savedTheme) {
            return savedTheme;
        }
        
        // Default to neutral
        return 'neutral';
    }

    saveTheme(theme) {
        localStorage.setItem('safematernity-theme', theme);
        this.currentTheme = theme;
    }

    applyTheme(theme) {
        // Apply theme to root element
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const colors = {
                'girl': '#d63384',
                'boy': '#667eea',
                'neutral': '#b8956a'
            };
            metaThemeColor.content = colors[theme] || colors['neutral'];
        }
    }

    createThemeSwitcher() {
        // Check if switcher already exists
        if (document.getElementById('theme-switcher-container')) {
            return;
        }

        const switcherHTML = `
            <div id="theme-switcher-container" class="theme-switcher-container">
                <div class="theme-switcher">
                    <button class="theme-btn" data-theme="girl" title="Girl theme (Pink)">
                        <span class="theme-icon">👧</span>
                        <span class="theme-label">Girl</span>
                    </button>
                    <button class="theme-btn" data-theme="boy" title="Boy theme (Blue)">
                        <span class="theme-icon">👦</span>
                        <span class="theme-label">Boy</span>
                    </button>
                    <button class="theme-btn" data-theme="neutral" title="Neutral theme (Beige)">
                        <span class="theme-icon">👶</span>
                        <span class="theme-label">Neutral</span>
                    </button>
                </div>
            </div>
        `;

        // Add styles for the floating theme switcher
        const styles = `
            <style id="theme-switcher-styles">
                .theme-switcher-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999;
                    animation: slideIn 0.3s ease;
                }

                .theme-switcher {
                    display: flex;
                    gap: 4px;
                    padding: 6px;
                    background: var(--background-primary);
                    border-radius: 50px;
                    box-shadow: var(--shadow-lg);
                    border: 2px solid var(--border-color);
                    backdrop-filter: blur(10px);
                    background: rgba(255, 255, 255, 0.95);
                }

                .theme-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 12px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    border-radius: 50px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }

                .theme-btn:hover {
                    background: var(--background-tertiary);
                    transform: scale(1.05);
                }

                .theme-btn.active {
                    background: var(--primary-color);
                    color: white;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }

                .theme-icon {
                    font-size: 1.1rem;
                    display: inline-block;
                }

                .theme-label {
                    display: none;
                }

                @media (min-width: 768px) {
                    .theme-label {
                        display: inline;
                    }
                }

                /* Minimized state */
                .theme-switcher-container.minimized .theme-switcher {
                    width: 50px;
                    height: 50px;
                    padding: 0;
                    justify-content: center;
                    align-items: center;
                    overflow: hidden;
                }

                .theme-switcher-container.minimized .theme-btn {
                    display: none;
                }

                .theme-switcher-container.minimized .theme-btn.active {
                    display: flex;
                    padding: 0;
                    background: var(--primary-color);
                }

                .theme-switcher-container.minimized .theme-label {
                    display: none;
                }

                /* Compact mode for profile settings */
                .theme-switcher-inline {
                    display: inline-flex;
                    gap: 8px;
                    padding: 4px;
                    background: var(--background-secondary);
                    border-radius: 30px;
                    border: 1px solid var(--border-color);
                }

                .theme-switcher-inline .theme-btn {
                    padding: 6px 16px;
                    font-size: 0.9rem;
                }

                .theme-switcher-inline .theme-icon {
                    font-size: 1rem;
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            </style>
        `;

        // Add styles to head if not already added
        if (!document.getElementById('theme-switcher-styles')) {
            document.head.insertAdjacentHTML('beforeend', styles);
        }

        // Add switcher to body
        document.body.insertAdjacentHTML('beforeend', switcherHTML);

        // Add event listeners
        this.attachEventListeners();
        
        // Set initial active state
        this.updateThemeSwitcherUI();
    }

    attachEventListeners() {
        const buttons = document.querySelectorAll('.theme-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.getAttribute('data-theme');
                this.switchTheme(theme);
            });
        });

        // Add minimize/expand functionality
        const container = document.getElementById('theme-switcher-container');
        if (container) {
            let clickTimeout;
            container.addEventListener('click', (e) => {
                if (container.classList.contains('minimized')) {
                    container.classList.remove('minimized');
                } else {
                    // Set timeout to minimize after interaction
                    clearTimeout(clickTimeout);
                    clickTimeout = setTimeout(() => {
                        container.classList.add('minimized');
                    }, 5000);
                }
            });
        }
    }

    switchTheme(theme) {
        this.saveTheme(theme);
        this.applyTheme(theme);
        this.updateThemeSwitcherUI();
        
        // Dispatch custom event for other components to listen to
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme } 
        }));
    }

    updateThemeSwitcherUI() {
        const buttons = document.querySelectorAll('.theme-btn');
        buttons.forEach(btn => {
            const btnTheme = btn.getAttribute('data-theme');
            if (btnTheme === this.currentTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Public method to get current theme
    getTheme() {
        return this.currentTheme;
    }

    // Public method to create inline theme switcher for settings
    createInlineSwitcher(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const inlineHTML = `
            <div class="theme-switcher-inline">
                <button class="theme-btn" data-theme="girl" title="Girl theme">
                    <span class="theme-icon">👧</span>
                    <span class="theme-label">Pink</span>
                </button>
                <button class="theme-btn" data-theme="boy" title="Boy theme">
                    <span class="theme-icon">👦</span>
                    <span class="theme-label">Blue</span>
                </button>
                <button class="theme-btn" data-theme="neutral" title="Neutral theme">
                    <span class="theme-icon">👶</span>
                    <span class="theme-label">Neutral</span>
                </button>
            </div>
        `;

        container.innerHTML = inlineHTML;
        
        // Attach event listeners for inline switcher
        const buttons = container.querySelectorAll('.theme-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.getAttribute('data-theme');
                this.switchTheme(theme);
            });
        });

        // Update active state
        this.updateThemeSwitcherUI();
    }
}

// Initialize theme switcher when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.themeSwitcher = new ThemeSwitcher();
    });
} else {
    window.themeSwitcher = new ThemeSwitcher();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeSwitcher;
}