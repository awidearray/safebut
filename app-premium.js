class PregnancySafetyChecker {
    constructor() {
        this.searchHistory = [];
        this.capturedImage = null;
        this.authToken = null;
        this.user = null;
        this.profileData = {};
        this.initializeAuth();
        this.initializeEventListeners();
        this.initializeTabNavigation();
        this.initializeProfileHandlers();
        this.checkAuthStatus();
    }

    initializeAuth() {
        // Check for token in URL params (from OAuth redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (token) {
            this.authToken = token;
            localStorage.setItem('authToken', token);
            // Clean URL
            window.history.replaceState({}, document.title, '/app');
        } else {
            // Check localStorage for existing token
            this.authToken = localStorage.getItem('authToken');
        }
    }

    async checkAuthStatus() {
        if (!this.authToken) {
            // Show login prompt
            this.showLoginPrompt();
            return;
        }

        try {
            const response = await fetch('/auth/me', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (!data.authenticated) {
                this.showLoginPrompt();
                return;
            }

            this.user = data.user;
            this.updateUIForUser();
            
            // Load user's history from server
            await this.loadUserHistory();
            
            // Check if user needs to upgrade
            if (!data.user.isPremium && data.user.dailySearchesRemaining === 0) {
                this.showUpgradePrompt();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showLoginPrompt();
        }
    }

    updateUIForUser() {
        if (!this.user) return;

        // Add user info to header
        const header = document.querySelector('header');
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.innerHTML = `
            <div class="user-details">
                ${this.user.profilePicture ? `<img src="${this.user.profilePicture}" alt="Profile" class="user-avatar">` : ''}
                <span class="user-name">${this.user.name}</span>
                ${this.user.isPremium ? 
                    '<span class="premium-badge">✨ Premium</span>' : 
                    `<span class="free-badge">${this.user.dailySearchesRemaining} searches left today</span>`
                }
            </div>
            <button id="logoutBtn" class="logout-btn">Logout</button>
        `;
        header.appendChild(userInfo);

        // Add logout handler
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    }

    showLoginPrompt() {
        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-modal-content">
                <h2>🤰 Welcome to Safe Maternity</h2>
                <p>Sign in to save your search history and get 3 free checks daily</p>
                <div class="auth-buttons">
                    <a href="/auth/facebook" class="auth-btn facebook-btn">
                        Continue with Facebook
                    </a>
                    <a href="/auth/instagram" class="auth-btn instagram-btn">
                        Continue with Instagram
                    </a>
                </div>
                <button class="skip-auth" onclick="this.parentElement.parentElement.remove()">
                    Continue without account (limited features)
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showUpgradePrompt() {
        const modal = document.createElement('div');
        modal.className = 'upgrade-modal';
        modal.innerHTML = `
            <div class="upgrade-modal-content">
                <h2>🎯 Daily Limit Reached</h2>
                <p>You've used your free daily check</p>
                <div class="upgrade-benefits">
                    <h3>Upgrade to Premium for just €24.99</h3>
                    <ul>
                        <li>✅ Unlimited searches forever</li>
                        <li>✅ Image analysis feature</li>
                        <li>✅ Complete search history</li>
                        <li>✅ One-time payment, lifetime access</li>
                    </ul>
                </div>
                <button id="upgradeBtn" class="upgrade-btn">
                    Upgrade Now for €24.99
                </button>
                <button class="close-modal" onclick="this.parentElement.parentElement.remove()">
                    Maybe later
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('upgradeBtn')?.addEventListener('click', () => {
            this.initializePayment();
        });
    }

    async initializePayment() {
        try {
            const response = await fetch('/payment/create-payment-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (data.error) {
                this.showError(data.error);
                return;
            }

            // Load Stripe
            const stripe = Stripe(data.publishableKey);
            
            // Show payment form
            this.showPaymentForm(stripe, data.clientSecret);
        } catch (error) {
            console.error('Payment initialization failed:', error);
            this.showError('Failed to initialize payment');
        }
    }

    showPaymentForm(stripe, clientSecret) {
        const modal = document.createElement('div');
        modal.className = 'payment-modal';
        modal.innerHTML = `
            <div class="payment-modal-content">
                <h2>Complete Your Purchase</h2>
                <p class="payment-amount">€24.99 - Lifetime Access</p>
                <form id="payment-form">
                    <div id="card-element"></div>
                    <div id="card-errors" role="alert"></div>
                    <button type="submit" id="submit-payment">
                        <span id="button-text">Pay €24.99</span>
                        <span id="spinner" class="hidden">Processing...</span>
                    </button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Create Stripe card element
        const elements = stripe.elements();
        const cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#32325d',
                    '::placeholder': {
                        color: '#aab7c4'
                    }
                }
            }
        });
        cardElement.mount('#card-element');

        // Handle payment submission
        const form = document.getElementById('payment-form');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            document.getElementById('submit-payment').disabled = true;
            document.getElementById('button-text').classList.add('hidden');
            document.getElementById('spinner').classList.remove('hidden');

            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: cardElement
                }
            });

            if (error) {
                document.getElementById('card-errors').textContent = error.message;
                document.getElementById('submit-payment').disabled = false;
                document.getElementById('button-text').classList.remove('hidden');
                document.getElementById('spinner').classList.add('hidden');
            } else {
                // Payment successful, confirm on server
                await this.confirmPayment(paymentIntent.id);
                modal.remove();
            }
        });
    }

    async confirmPayment(paymentIntentId) {
        try {
            const response = await fetch('/payment/confirm-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ paymentIntentId })
            });

            const data = await response.json();

            if (data.success) {
                this.user.isPremium = true;
                this.updateUIForUser();
                this.showSuccess('🎉 Welcome to Premium! Enjoy unlimited searches!');
            } else {
                this.showError('Payment confirmation failed');
            }
        } catch (error) {
            console.error('Payment confirmation error:', error);
            this.showError('Failed to confirm payment');
        }
    }

    async loadUserHistory() {
        if (!this.authToken) return;

        try {
            const response = await fetch('/api/history', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                this.searchHistory = await response.json();
                this.displayHistory();
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }

    async logout() {
        await fetch('/auth/logout', { method: 'POST' });
        localStorage.removeItem('authToken');
        window.location.href = '/login';
    }

    initializeEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        const searchInput = document.getElementById('searchInput');
        const exampleChips = document.querySelectorAll('.chip');
        const clearHistoryBtn = document.getElementById('clearHistory');
        const cameraBtn = document.getElementById('cameraBtn');
        const cameraInput = document.getElementById('cameraInput');
        const removeImageBtn = document.getElementById('removeImage');

        searchBtn.addEventListener('click', () => this.performSearch());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        exampleChips.forEach(chip => {
            chip.addEventListener('click', () => {
                searchInput.value = chip.dataset.example;
                this.performSearch();
            });
        });

        clearHistoryBtn?.addEventListener('click', () => {
            this.clearHistory();
        });

        // Camera functionality
        cameraBtn?.addEventListener('click', () => {
            cameraInput.click();
        });

        cameraInput?.addEventListener('change', (e) => {
            this.handleImageCapture(e.target.files[0]);
        });

        removeImageBtn?.addEventListener('click', () => {
            this.removeImage();
        });
    }

    async handleImageCapture(file) {
        if (!file) return;

        // Check if user has premium for image analysis
        if (!this.user?.isPremium) {
            this.showUpgradePrompt();
            return;
        }

        // Compress image before processing
        const compressedImage = await this.compressImage(file);
        
        const imagePreview = document.getElementById('imagePreview');
        const capturedImage = document.getElementById('capturedImage');
        const searchInput = document.getElementById('searchInput');
        
        capturedImage.src = compressedImage;
        imagePreview.style.display = 'block';
        this.capturedImage = compressedImage;
        
        searchInput.value = '';
        searchInput.placeholder = 'Analyzing image...';
        
        this.performSearch();
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    let width = img.width;
                    let height = img.height;
                    const maxSize = 800;
                    
                    if (width > height && width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(compressedDataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    removeImage() {
        const imagePreview = document.getElementById('imagePreview');
        const searchInput = document.getElementById('searchInput');
        const cameraInput = document.getElementById('cameraInput');
        
        imagePreview.style.display = 'none';
        this.capturedImage = null;
        cameraInput.value = '';
        searchInput.placeholder = 'Enter anything to check if it\'s safe';
    }

    async performSearch(item = null) {
        const searchInput = document.getElementById('searchInput');
        const query = item || searchInput.value.trim();

        // Check if user is authenticated for better experience
        if (!this.authToken) {
            this.showLoginPrompt();
            return;
        }

        // Check if user has searches remaining
        if (!this.user?.isPremium && this.user?.dailySearchesRemaining === 0) {
            this.showUpgradePrompt();
            return;
        }

        // If we have an image, analyze it
        if (this.capturedImage && !query) {
            this.showLoading(true);
            this.hideError();
            this.hideResults();

            try {
                const result = await this.checkImageSafety(this.capturedImage);
                this.displayResults('Analyzed Image', result);
                await this.checkAuthStatus(); // Refresh user status
            } catch (error) {
                if (error.message.includes('Daily limit')) {
                    this.showUpgradePrompt();
                } else {
                    this.showError('Failed to analyze image. Please try again.');
                }
                console.error('Error:', error);
            } finally {
                this.showLoading(false);
            }
            return;
        }

        if (!query) {
            this.showError('Please enter something to check or take a photo');
            return;
        }

        this.showLoading(true);
        this.hideError();
        this.hideResults();

        try {
            const result = await this.checkSafety(query);
            this.displayResults(query, result);
            await this.checkAuthStatus(); // Refresh user status
        } catch (error) {
            if (error.message.includes('Daily limit')) {
                this.showUpgradePrompt();
            } else {
                this.showError('Failed to check safety. Please try again.');
            }
            console.error('Error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async checkSafety(item) {
        const response = await fetch('/api/check-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({ item })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.requiresUpgrade) {
                // Show upgrade prompt for daily limit
                this.showUpgradePrompt();
                throw new Error('Daily limit reached');
            }
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        return await response.json();
    }

    async checkImageSafety(imageData) {
        const response = await fetch('/api/check-image-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({ image: imageData })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.requiresUpgrade) {
                // Show upgrade prompt for daily limit
                this.showUpgradePrompt();
                throw new Error('Daily limit reached');
            }
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        return await response.json();
    }

    // Rest of the methods remain the same...
    displayResults(item, data) {
        const resultsSection = document.getElementById('results');
        const itemName = document.getElementById('itemName');
        const safetyBadge = document.getElementById('safetyBadge');
        const resultContent = document.getElementById('resultContent');
        const riskIndicator = document.getElementById('riskIndicator');
        const safetyVerdict = document.getElementById('safetyVerdict');
        const referenceLinks = document.getElementById('referenceLinks');

        itemName.textContent = item;

        const safetyLevel = this.extractSafetyLevel(data.result);
        safetyBadge.textContent = safetyLevel.text;
        safetyBadge.className = `safety-badge ${safetyLevel.class}`;

        const riskScore = data.riskScore || 5;
        riskIndicator.textContent = riskScore;
        const position = ((riskScore - 1) / 9) * 100;
        riskIndicator.style.left = `calc(${position}% - 25px)`;

        const color = this.getRiskColor(riskScore);
        riskIndicator.style.borderColor = color;
        riskIndicator.style.color = color;

        if (riskScore <= 4) {
            safetyVerdict.textContent = '✅ SAFE - This is generally considered safe during pregnancy';
            safetyVerdict.className = 'safety-verdict safe';
        } else {
            safetyVerdict.textContent = '❌ NOT SAFE - This should be avoided or used with extreme caution';
            safetyVerdict.className = 'safety-verdict unsafe';
        }

        const formattedContent = this.formatContent(data.result);
        resultContent.innerHTML = formattedContent;

        if (data.references && data.references.length > 0) {
            referenceLinks.innerHTML = data.references.map(ref => 
                `<a href="${ref.url}" target="_blank" class="reference-link">→ ${ref.title}</a>`
            ).join('');
        }

        resultsSection.style.display = 'block';
    }

    getRiskColor(score) {
        const colors = [
            '#00ff00', '#33ff00', '#66ff00', '#99ff00', '#ffff00',
            '#ffcc00', '#ff9900', '#ff6600', '#ff3300', '#ff0000'
        ];
        return colors[Math.min(Math.max(score - 1, 0), 9)];
    }

    extractSafetyLevel(content) {
        const lowerContent = content.toLowerCase();
        
        if (lowerContent.includes('safety: safe') || lowerContent.includes('generally safe')) {
            return { text: 'Generally Safe', class: 'safe' };
        } else if (lowerContent.includes('caution')) {
            return { text: 'Use Caution', class: 'caution' };
        } else if (lowerContent.includes('avoid')) {
            return { text: 'Avoid', class: 'avoid' };
        } else if (lowerContent.includes('consult')) {
            return { text: 'Consult Provider', class: 'consult' };
        } else {
            return { text: 'Check Details', class: 'caution' };
        }
    }

    formatContent(content) {
        let formatted = content
            .replace(/RISK_SCORE:.*\n/g, '')
            .replace(/SAFETY:.*\n/g, '')
            .replace(/WHY:/g, '<h3>Why:</h3>')
            .replace(/TIPS:/g, '<h3>Tips:</h3>')
            .replace(/^- /gm, '• ')
            .replace(/^\* /gm, '• ');

        const lines = formatted.split('\n');
        let inList = false;
        let finalFormatted = '';

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            if (line.startsWith('• ')) {
                if (!inList) {
                    finalFormatted += '<ul>';
                    inList = true;
                }
                finalFormatted += `<li>${line.substring(2)}</li>`;
            } else {
                if (inList) {
                    finalFormatted += '</ul>';
                    inList = false;
                }
                if (line.includes('<h3>')) {
                    finalFormatted += line;
                } else {
                    finalFormatted += `<p>${line}</p>`;
                }
            }
        });

        if (inList) {
            finalFormatted += '</ul>';
        }

        return finalFormatted;
    }

    displayHistory() {
        const historySection = document.getElementById('historySection');
        const historyItems = document.getElementById('historyItems');

        if (!historySection || !historyItems) return;

        if (this.searchHistory.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        
        historyItems.innerHTML = this.searchHistory.slice(0, 20).map(item => {
            const color = this.getRiskColor(item.riskScore);
            return `
                <div class="history-item" onclick="checker.performSearch('${item.item}')">
                    <span class="history-item-name">${item.item}</span>
                    <span class="history-item-risk" style="background: ${color}22; color: ${color}; border: 1px solid ${color}">
                        Risk: ${item.riskScore}/10
                    </span>
                </div>
            `;
        }).join('');
    }

    clearHistory() {
        this.searchHistory = [];
        this.displayHistory();
    }

    showLoading(show) {
        const btnText = document.querySelector('.btn-text');
        const loader = document.querySelector('.loader');
        const searchBtn = document.getElementById('searchBtn');

        if (show) {
            btnText.style.display = 'none';
            loader.style.display = 'block';
            searchBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            loader.style.display = 'none';
            searchBtn.disabled = false;
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        const errorText = document.getElementById('errorText');
        errorText.textContent = message;
        errorDiv.style.display = 'flex';
    }

    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 3000);
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }

    hideResults() {
        document.getElementById('results').style.display = 'none';
    }

    initializeTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // Update button states
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update content visibility
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    content.style.display = 'none';
                });
                
                const targetContent = document.getElementById(targetTab + 'Tab');
                if (targetContent) {
                    targetContent.classList.add('active');
                    targetContent.style.display = 'block';
                }
                
                // Load history when history tab is clicked
                if (targetTab === 'history') {
                    this.displayHistory();
                }
            });
        });
    }

    initializeProfileHandlers() {
        const saveBtn = document.getElementById('saveProfile');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveProfile());
        }
        
        // Auto-calculate weeks pregnant from due date
        const dueDateInput = document.getElementById('due-date');
        if (dueDateInput) {
            dueDateInput.addEventListener('change', () => {
                const dueDate = new Date(dueDateInput.value);
                const today = new Date();
                const diffTime = dueDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const weeksPregnant = Math.max(0, 40 - Math.floor(diffDays / 7));
                
                const weeksInput = document.getElementById('weeks-pregnant');
                if (weeksInput) {
                    weeksInput.value = weeksPregnant;
                }
                
                // Auto-select trimester
                let trimester = 'first';
                if (weeksPregnant >= 13 && weeksPregnant < 28) trimester = 'second';
                if (weeksPregnant >= 28) trimester = 'third';
                
                document.querySelectorAll('input[name="trimester"]').forEach(radio => {
                    radio.checked = radio.value === trimester;
                });
            });
        }
    }

    async loadProfile() {
        if (!this.authToken) return;
        
        try {
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.profileData = data.profile || {};
                this.populateProfileForm();
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    populateProfileForm() {
        // Populate basic info
        if (this.profileData.name) document.getElementById('profile-name').value = this.profileData.name;
        if (this.profileData.age) document.getElementById('profile-age').value = this.profileData.age;
        if (this.profileData.dueDate) document.getElementById('due-date').value = this.profileData.dueDate;
        if (this.profileData.weeksPregnant) document.getElementById('weeks-pregnant').value = this.profileData.weeksPregnant;
        if (this.profileData.pregnancyNumber) document.getElementById('pregnancy-number').value = this.profileData.pregnancyNumber;
        if (this.profileData.healthcareProvider) document.getElementById('healthcare-provider').value = this.profileData.healthcareProvider;
        
        // Populate conditions
        if (this.profileData.conditions) {
            Object.keys(this.profileData.conditions).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) checkbox.checked = this.profileData.conditions[key];
            });
        }
        
        // Populate risk factors
        if (this.profileData.riskFactors) {
            Object.keys(this.profileData.riskFactors).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) checkbox.checked = this.profileData.riskFactors[key];
            });
        }
        
        // Populate diet
        if (this.profileData.diet) {
            Object.keys(this.profileData.diet).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) checkbox.checked = this.profileData.diet[key];
            });
        }
        
        // Populate trimester
        if (this.profileData.trimester) {
            document.querySelectorAll('input[name="trimester"]').forEach(radio => {
                radio.checked = radio.value === this.profileData.trimester;
            });
        }
    }

    async saveProfile() {
        if (!this.authToken) {
            this.showError('Please log in to save your profile');
            return;
        }
        
        // Collect form data
        const profileData = {
            // Basic info
            name: document.getElementById('profile-name').value,
            age: document.getElementById('profile-age').value,
            dueDate: document.getElementById('due-date').value,
            weeksPregnant: document.getElementById('weeks-pregnant').value,
            pregnancyNumber: document.getElementById('pregnancy-number').value,
            healthcareProvider: document.getElementById('healthcare-provider').value,
            
            // Conditions
            conditions: {},
            riskFactors: {},
            diet: {},
            
            // Trimester
            trimester: document.querySelector('input[name="trimester"]:checked')?.value
        };
        
        // Collect conditions
        document.querySelectorAll('input[name="conditions"]').forEach(checkbox => {
            profileData.conditions[checkbox.id] = checkbox.checked;
        });
        
        // Collect risk factors
        document.querySelectorAll('input[name="risk-factors"]').forEach(checkbox => {
            profileData.riskFactors[checkbox.id] = checkbox.checked;
        });
        
        // Collect diet
        document.querySelectorAll('input[name="diet"]').forEach(checkbox => {
            profileData.diet[checkbox.id] = checkbox.checked;
        });
        
        try {
            const response = await fetch('/api/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(profileData)
            });
            
            if (response.ok) {
                this.profileData = profileData;
                this.showSuccess('✅ Profile saved successfully!');
            } else {
                this.showError('Failed to save profile');
            }
        } catch (error) {
            console.error('Save profile error:', error);
            this.showError('Failed to save profile');
        }
    }
}

let checker;
document.addEventListener('DOMContentLoaded', () => {
    checker = new PregnancySafetyChecker();
    
    // Load Stripe if not already loaded
    if (!window.Stripe) {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        document.head.appendChild(script);
    }
});