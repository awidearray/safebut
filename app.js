class PregnancySafetyChecker {
    constructor() {
        this.searchHistory = JSON.parse(localStorage.getItem('pregnancySafetyHistory') || '[]');
        this.capturedImage = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.logEntries = [];
        this.currentSearchItem = null;
        this.currentSearchType = null; // 'text' or 'image'
        this.initializeTabs();
        this.initializeEventListeners();
        this.initializeProfile();
        this.initializeLog();
        this.displayHistory();
    }

    initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            if (button.id === 'logoutBtn') return; // Skip logout button
            
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // Remove active class from all tabs and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => {
                    content.style.display = 'none';
                    content.classList.remove('active');
                });
                
                // Add active class to clicked tab
                button.classList.add('active');
                
                // Show corresponding content
                const targetContent = document.getElementById(targetTab + 'Tab');
                if (targetContent) {
                    targetContent.style.display = 'block';
                    targetContent.classList.add('active');
                }
            });
        });
    }
    
    initializeProfile() {
        const saveProfileBtn = document.getElementById('saveProfile');
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', () => {
                this.saveProfile();
            });
        }
        
        // Load saved profile data
        this.loadProfile();
    }
    
    saveProfile() {
        const profile = {
            name: document.getElementById('profile-name').value,
            age: document.getElementById('profile-age').value,
            dueDate: document.getElementById('due-date').value,
            weeksPregnant: document.getElementById('weeks-pregnant').value,
            pregnancyNumber: document.getElementById('pregnancy-number').value,
            healthcareProvider: document.getElementById('healthcare-provider').value,
            conditions: [],
            riskFactors: [],
            diet: [],
            trimester: document.querySelector('input[name="trimester"]:checked')?.value,
            // Response preferences
            preferences: {
                measurementSystem: document.querySelector('input[name="measurement-system"]:checked')?.value || 'imperial',
                caffeineMeasurement: document.querySelector('input[name="caffeine-measurement"]:checked')?.value || 'cups',
                temperatureUnit: document.querySelector('input[name="temperature-unit"]:checked')?.value || 'fahrenheit',
                weightUnit: document.querySelector('input[name="weight-unit"]:checked')?.value || 'imperial',
                detailLevel: document.querySelector('input[name="detail-level"]:checked')?.value || 'brief',
                languageStyle: document.querySelector('input[name="language-style"]:checked')?.value || 'simple',
                riskStyle: document.querySelector('input[name="risk-style"]:checked')?.value || 'balanced'
            }
        };
        
        // Save conditions
        document.querySelectorAll('input[name="conditions"]:checked').forEach(input => {
            profile.conditions.push(input.id);
        });
        
        // Save risk factors
        document.querySelectorAll('input[name="risk-factors"]:checked').forEach(input => {
            profile.riskFactors.push(input.id);
        });
        
        // Save diet
        document.querySelectorAll('input[name="diet"]:checked').forEach(input => {
            profile.diet.push(input.id);
        });
        
        localStorage.setItem('pregnancyProfile', JSON.stringify(profile));
        
        // Show success message
        const saveBtn = document.getElementById('saveProfile');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✅ Saved!';
        saveBtn.style.background = '#48bb78';
        
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '';
        }, 2000);
    }
    
    loadProfile() {
        const savedProfile = localStorage.getItem('pregnancyProfile');
        if (!savedProfile) return;
        
        const profile = JSON.parse(savedProfile);
        
        // Load basic info
        if (profile.name) document.getElementById('profile-name').value = profile.name;
        if (profile.age) document.getElementById('profile-age').value = profile.age;
        if (profile.dueDate) document.getElementById('due-date').value = profile.dueDate;
        if (profile.weeksPregnant) document.getElementById('weeks-pregnant').value = profile.weeksPregnant;
        if (profile.pregnancyNumber) document.getElementById('pregnancy-number').value = profile.pregnancyNumber;
        if (profile.healthcareProvider) document.getElementById('healthcare-provider').value = profile.healthcareProvider;
        
        // Load conditions
        if (profile.conditions) {
            profile.conditions.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        // Load risk factors
        if (profile.riskFactors) {
            profile.riskFactors.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        // Load diet
        if (profile.diet) {
            profile.diet.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        // Load trimester
        if (profile.trimester) {
            const radio = document.querySelector(`input[name="trimester"][value="${profile.trimester}"]`);
            if (radio) radio.checked = true;
        }
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

        clearHistoryBtn.addEventListener('click', () => {
            this.clearHistory();
        });

        // Camera functionality
        cameraBtn.addEventListener('click', () => {
            // Check if user is premium (camera is premium-only feature)
            const isPremium = localStorage.getItem('isPremium') === 'true';
            if (!isPremium) {
                this.showUpgradePrompt();
                return;
            }
            cameraInput.click();
        });

        cameraInput.addEventListener('change', (e) => {
            this.handleImageCapture(e.target.files[0]);
        });

        removeImageBtn.addEventListener('click', () => {
            this.removeImage();
        });

        // Detailed answer functionality
        const getDetailsBtn = document.getElementById('getDetailsBtn');
        if (getDetailsBtn) {
            getDetailsBtn.addEventListener('click', () => {
                this.requestDetailedAnswer();
            });
        }
    }

    async handleImageCapture(file) {
        if (!file) return;

        // Check if user is premium (camera is premium-only feature)
        const isPremium = localStorage.getItem('isPremium') === 'true';
        if (!isPremium) {
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
        
        // Clear text input when image is selected
        searchInput.value = '';
        searchInput.placeholder = 'Analyzing image...';
        
        // Automatically analyze the image
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
                    
                    // Calculate new dimensions (max 800px width/height)
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
                    
                    // Draw and compress
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to base64 with compression (0.7 quality)
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
        searchInput.placeholder = 'Enter anything to check if it\'s safe (e.g., \'coffee\', \'flying\', \'yoga\', \'hot tubs\')';
    }

    async performSearch(item = null) {
        const searchInput = document.getElementById('searchInput');
        const query = item || searchInput.value.trim();

        // If we have an image, analyze it instead of text
        if (this.capturedImage && !query) {
            this.showLoading(true);
            this.hideError();
            this.hideResults();

            try {
                const result = await this.checkImageSafety(this.capturedImage);
                this.displayResults('Analyzed Image', result);
                this.addToHistory('Photo Analysis', result.riskScore);
                // Track current search for detailed answers
                this.currentSearchItem = this.capturedImage;
                this.currentSearchType = 'image';
            } catch (error) {
                this.showError('Failed to analyze image. Please try again.');
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
            this.addToHistory(query, result.riskScore);
            // Track current search for detailed answers
            this.currentSearchItem = query;
            this.currentSearchType = 'text';
        } catch (error) {
            console.error('Error:', error);
            
            // Check if it's a daily limit error
            if (error.message.includes('Daily limit reached') || error.message.includes('Trial limit reached')) {
                this.showUpgradePrompt();
            } else {
                this.showError('Failed to check safety. Please try again.');
            }
        } finally {
            this.showLoading(false);
        }
    }

    async checkSafety(item) {
        const authToken = localStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth token if available
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch('/api/check-safety', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                item: item
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    }

    async checkImageSafety(imageData) {
        const authToken = localStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth token if available
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch('/api/check-image-safety', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                image: imageData
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    }

    async getDetailedSafetyInfo(item) {
        const authToken = localStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth token if available
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch('/api/detailed-safety', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                item: item
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    }

    async getDetailedImageSafetyInfo(imageData) {
        const authToken = localStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth token if available
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch('/api/detailed-image-safety', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                image: imageData
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    }

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

        // Set risk score and position indicator
        const riskScore = data.riskScore || 5;
        riskIndicator.textContent = riskScore;
        const position = ((riskScore - 1) / 9) * 100;
        riskIndicator.style.left = `calc(${position}% - 25px)`;

        // Set color based on risk score
        const color = this.getRiskColor(riskScore);
        riskIndicator.style.borderColor = color;
        riskIndicator.style.color = color;

        // Set safety verdict
        if (riskScore <= 4) {
            safetyVerdict.textContent = '✅ SAFE - This is generally considered safe during pregnancy';
            safetyVerdict.className = 'safety-verdict safe';
        } else {
            safetyVerdict.textContent = '❌ NOT SAFE - This should be avoided or used with extreme caution';
            safetyVerdict.className = 'safety-verdict unsafe';
        }

        // Format and display content
        const formattedContent = this.formatContent(data.result);
        resultContent.innerHTML = formattedContent;

        // Add reference links
        if (data.references && data.references.length > 0) {
            referenceLinks.innerHTML = data.references.map(ref => 
                `<a href="${ref.url}" target="_blank" class="reference-link">→ ${ref.title}</a>`
            ).join('');
        }

        resultsSection.style.display = 'block';
        
        // Show the details section and reset its state
        const detailsSection = document.getElementById('detailsSection');
        const detailedContent = document.getElementById('detailedContent');
        const getDetailsBtn = document.getElementById('getDetailsBtn');
        
        if (detailsSection && detailedContent && getDetailsBtn) {
            detailsSection.style.display = 'block';
            detailedContent.style.display = 'none';
            getDetailsBtn.disabled = false;
            
            // Reset button text and loader
            const btnText = getDetailsBtn.querySelector('.details-btn-text');
            const loader = getDetailsBtn.querySelector('.details-loader');
            if (btnText && loader) {
                btnText.style.display = 'inline';
                loader.style.display = 'none';
            }
        }
    }

    async requestDetailedAnswer() {
        if (!this.currentSearchItem || !this.currentSearchType) {
            this.showError('No search to get details for. Please search first.');
            return;
        }

        const getDetailsBtn = document.getElementById('getDetailsBtn');
        const btnText = getDetailsBtn.querySelector('.details-btn-text');
        const loader = getDetailsBtn.querySelector('.details-loader');
        const detailedContent = document.getElementById('detailedContent');
        const detailedAnswer = document.getElementById('detailedAnswer');

        // Show loading state
        if (btnText && loader) {
            btnText.style.display = 'none';
            loader.style.display = 'block';
        }
        getDetailsBtn.disabled = true;

        try {
            let result;
            if (this.currentSearchType === 'text') {
                result = await this.getDetailedSafetyInfo(this.currentSearchItem);
            } else if (this.currentSearchType === 'image') {
                result = await this.getDetailedImageSafetyInfo(this.currentSearchItem);
            }

            // Display detailed results
            if (detailedAnswer && result) {
                const formattedContent = this.formatContent(result.result);
                detailedAnswer.innerHTML = formattedContent;
                detailedContent.style.display = 'block';
                
                // Change button text to indicate more details were loaded
                if (btnText) {
                    btnText.textContent = '✅ Detailed Analysis Loaded';
                }
            }
        } catch (error) {
            console.error('Error getting detailed answer:', error);
            this.showError('Failed to get detailed answer. Please try again.');
        } finally {
            // Reset loading state
            if (btnText && loader) {
                loader.style.display = 'none';
                btnText.style.display = 'inline';
            }
            getDetailsBtn.disabled = true; // Keep disabled since details are now loaded
        }
    }

    getRiskColor(score) {
        const colors = [
            '#00ff00', // 1 - Bright Green
            '#33ff00', // 2
            '#66ff00', // 3
            '#99ff00', // 4
            '#ffff00', // 5 - Yellow
            '#ffcc00', // 6
            '#ff9900', // 7
            '#ff6600', // 8
            '#ff3300', // 9
            '#ff0000'  // 10 - Red
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
        // Clean up the simplified response format
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

    addToHistory(item, riskScore) {
        // Remove duplicate if exists
        this.searchHistory = this.searchHistory.filter(h => h.item.toLowerCase() !== item.toLowerCase());
        
        // Add new item at beginning
        this.searchHistory.unshift({
            item: item,
            riskScore: riskScore,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20 items
        this.searchHistory = this.searchHistory.slice(0, 20);

        // Save to localStorage
        localStorage.setItem('pregnancySafetyHistory', JSON.stringify(this.searchHistory));

        // Update display
        this.displayHistory();
    }

    displayHistory() {
        const historyItems = document.getElementById('historyItems');
        
        if (!historyItems) return;

        if (this.searchHistory.length === 0) {
            historyItems.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No search history yet. Start searching to see your history here!</p>';
            return;
        }
        
        historyItems.innerHTML = this.searchHistory.map(item => {
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
        localStorage.removeItem('pregnancySafetyHistory');
        this.displayHistory();
    }

    showUpgradePrompt() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 20px;
                padding: 40px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            ">
                <h2 style="color: #667eea; margin-bottom: 20px;">📸 Camera Access is Premium Only</h2>
                <p style="color: #666; margin-bottom: 25px;">
                    Upgrade to Premium for just $0.99 lifetime to unlock:
                </p>
                <ul style="text-align: left; margin: 0 auto 25px; max-width: 300px; color: #333;">
                    <li style="margin-bottom: 10px;">✅ Camera & Image Analysis</li>
                    <li style="margin-bottom: 10px;">✅ Unlimited searches (vs 1/day)</li>
                    <li style="margin-bottom: 10px;">✅ Detailed medical reports</li>
                    <li style="margin-bottom: 10px;">✅ Export history as PDF</li>
                </ul>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <a href="/login" style="
                        display: inline-block;
                        padding: 12px 30px;
                        background: #667eea;
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: 600;
                    ">Upgrade Now</a>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
                        padding: 12px 30px;
                        background: #e2e8f0;
                        color: #333;
                        border: none;
                        border-radius: 25px;
                        font-weight: 600;
                        cursor: pointer;
                    ">Maybe Later</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
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

    showUpgradePrompt() {
        const errorDiv = document.getElementById('error');
        const errorText = document.getElementById('errorText');
        
        // Create upgrade prompt HTML
        errorText.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 1.2em; margin-bottom: 10px;">🎯 Daily Limit Reached</div>
                <div style="margin-bottom: 15px;">You've used your free search for today! Upgrade to get unlimited searches, image analysis, and more.</div>
                <button onclick="showUpgradeTab()" style="background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-right: 10px;">
                    🚀 Upgrade Now - $0.99
                </button>
                <button onclick="checker.hideError()" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    Maybe Later
                </button>
            </div>
        `;
        errorDiv.style.display = 'flex';
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        const errorText = document.getElementById('errorText');
        errorText.textContent = message;
        errorDiv.style.display = 'flex';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }

    hideResults() {
        document.getElementById('results').style.display = 'none';
        
        // Also hide details section
        const detailsSection = document.getElementById('detailsSection');
        if (detailsSection) {
            detailsSection.style.display = 'none';
        }
    }

    // Log Tab Methods
    initializeLog() {
        // Check if user is premium
        const logTabBtn = document.getElementById('logTabBtn');
        const isPremium = localStorage.getItem('isPremium') === 'true';
        
        if (!isPremium) {
            // Hide log tab for non-premium users
            if (logTabBtn) {
                logTabBtn.style.display = 'none';
            }
            return;
        }
        
        // Initialize calendar
        this.initializeCalendar();
        
        // Initialize voice recording
        this.initializeVoiceRecording();
        
        // Load existing entries
        this.loadLogEntries();
        
        // Save button handler
        const saveBtn = document.getElementById('saveLogEntry');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveLogEntry());
        }
        
        // Calendar navigation
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.changeMonth(-1));
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.changeMonth(1));
        }
    }
    
    initializeCalendar() {
        this.updateCalendarDisplay();
    }
    
    updateCalendarDisplay() {
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        
        document.getElementById('currentMonth').textContent = 
            `${monthNames[this.currentMonth]} ${this.currentYear}`;
        
        this.generateCalendarDays();
    }
    
    generateCalendarDays() {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const daysContainer = document.getElementById('calendarDays');
        
        if (!daysContainer) return;
        
        daysContainer.innerHTML = '';
        
        // Add empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day other-month';
            daysContainer.appendChild(emptyDay);
        }
        
        // Add days of the month
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.dataset.date = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Check if it's today
            if (today.getDate() === day && 
                today.getMonth() === this.currentMonth && 
                today.getFullYear() === this.currentYear) {
                dayElement.classList.add('today');
            }
            
            // Check if there are entries for this day
            const dateStr = dayElement.dataset.date;
            const dayEntries = this.logEntries.filter(entry => 
                entry.date && entry.date.startsWith(dateStr)
            );
            
            if (dayEntries.length > 0) {
                dayElement.classList.add('has-entry');
            }
            
            dayElement.innerHTML = `
                <div class="calendar-day-number">${day}</div>
                ${dayEntries.length > 0 ? 
                    `<div class="calendar-day-entries">${dayEntries.length} entry${dayEntries.length > 1 ? 'ies' : ''}</div>` 
                    : ''}
            `;
            
            dayElement.addEventListener('click', () => this.showDayEntries(dateStr));
            
            daysContainer.appendChild(dayElement);
        }
    }
    
    changeMonth(direction) {
        this.currentMonth += direction;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        } else if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.updateCalendarDisplay();
    }
    
    initializeVoiceRecording() {
        const recordBtn = document.getElementById('voiceRecordBtn');
        const recordingIndicator = document.getElementById('recordingIndicator');
        const voicePreview = document.getElementById('voicePreview');
        
        if (!recordBtn) return;
        
        let isRecording = false;
        
        // Mouse/touch events for hold-to-record
        recordBtn.addEventListener('mousedown', () => this.startRecording());
        recordBtn.addEventListener('mouseup', () => this.stopRecording());
        recordBtn.addEventListener('mouseleave', () => {
            if (isRecording) this.stopRecording();
        });
        
        // Touch events for mobile
        recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const voicePreview = document.getElementById('voicePreview');
                if (voicePreview) {
                    voicePreview.src = audioUrl;
                    voicePreview.style.display = 'block';
                }
                this.currentAudioBlob = audioBlob;
            };
            
            this.mediaRecorder.start();
            document.getElementById('recordingIndicator').style.display = 'flex';
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Please allow microphone access to record voice notes.');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            document.getElementById('recordingIndicator').style.display = 'none';
        }
    }
    
    async saveLogEntry() {
        const textInput = document.getElementById('logTextInput');
        const text = textInput ? textInput.value.trim() : '';
        
        if (!text && !this.currentAudioBlob) {
            alert('Please enter text or record a voice note');
            return;
        }
        
        const entry = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            text: text,
            type: this.currentAudioBlob ? 'voice' : 'text',
            audioUrl: this.currentAudioBlob ? URL.createObjectURL(this.currentAudioBlob) : null
        };
        
        // Save to backend
        try {
            const response = await fetch('/api/log-entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(entry)
            });
            
            if (response.ok) {
                const savedEntry = await response.json();
                this.logEntries.push(savedEntry);
                
                // Clear inputs
                if (textInput) textInput.value = '';
                this.currentAudioBlob = null;
                const voicePreview = document.getElementById('voicePreview');
                if (voicePreview) {
                    voicePreview.style.display = 'none';
                    voicePreview.src = '';
                }
                
                // Refresh calendar and recent entries
                this.generateCalendarDays();
                this.displayRecentEntries();
                
                alert('Entry saved successfully!');
            }
        } catch (error) {
            console.error('Error saving log entry:', error);
            alert('Failed to save entry. Please try again.');
        }
    }
    
    async loadLogEntries() {
        // Only load if premium user
        if (localStorage.getItem('isPremium') !== 'true') {
            return;
        }
        
        try {
            const response = await fetch('/api/log-entries', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (response.ok) {
                this.logEntries = await response.json();
                this.generateCalendarDays();
                this.displayRecentEntries();
            } else if (response.status === 403) {
                console.log('Premium subscription required for log entries');
            }
        } catch (error) {
            console.error('Error loading log entries:', error);
        }
    }
    
    displayRecentEntries() {
        const container = document.getElementById('recentLogEntries');
        if (!container) return;
        
        const recentEntries = this.logEntries
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        container.innerHTML = recentEntries.map(entry => `
            <div class="log-entry-item" onclick="pregnancySafetyChecker.showLogEntry('${entry.id}')">
                <div class="log-entry-date">
                    ${new Date(entry.date).toLocaleDateString()} at ${new Date(entry.date).toLocaleTimeString()}
                </div>
                <div class="log-entry-preview">
                    ${entry.text || 'Voice note'}
                </div>
                <span class="log-entry-type ${entry.type}">${entry.type === 'voice' ? '🎤 Voice' : '📝 Text'}</span>
            </div>
        `).join('');
    }
    
    showDayEntries(dateStr) {
        const dayEntries = this.logEntries.filter(entry => 
            entry.date && entry.date.startsWith(dateStr)
        );
        
        if (dayEntries.length === 0) {
            return;
        }
        
        if (dayEntries.length === 1) {
            this.showLogEntry(dayEntries[0].id);
        } else {
            // Show list of entries for that day
            this.showEntriesList(dayEntries, dateStr);
        }
    }
    
    showEntriesList(entries, dateStr) {
        const modal = document.getElementById('logModal');
        const modalBody = document.getElementById('logModalBody');
        
        modalBody.innerHTML = `
            <h3>Entries for ${new Date(dateStr).toLocaleDateString()}</h3>
            <div class="entries-list">
                ${entries.map(entry => `
                    <div class="log-entry-item" onclick="pregnancySafetyChecker.showLogEntry('${entry.id}')">
                        <div class="log-entry-date">
                            ${new Date(entry.date).toLocaleTimeString()}
                        </div>
                        <div class="log-entry-preview">
                            ${entry.text || 'Voice note'}
                        </div>
                        <span class="log-entry-type ${entry.type}">${entry.type === 'voice' ? '🎤' : '📝'}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        modal.style.display = 'block';
    }
    
    async showLogEntry(entryId) {
        const entry = this.logEntries.find(e => e.id === entryId);
        if (!entry) return;
        
        const modal = document.getElementById('logModal');
        const modalBody = document.getElementById('logModalBody');
        
        modalBody.innerHTML = `
            <div class="original-entry">
                <h4>Your Entry</h4>
                <div class="original-entry-text">
                    ${entry.text || 'Voice note recorded'}
                    ${entry.audioUrl ? `<audio controls src="${entry.audioUrl}" style="margin-top: 10px; width: 100%;"></audio>` : ''}
                </div>
                <small>${new Date(entry.date).toLocaleString()}</small>
            </div>
            
            <div class="loading-analysis">
                <div class="loading-spinner"></div>
                <p>Analyzing your entry with Venice AI...</p>
            </div>
        `;
        
        modal.style.display = 'block';
        
        // Get Venice AI analysis
        try {
            const response = await fetch('/api/analyze-log-entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ entryId, text: entry.text })
            });
            
            if (response.ok) {
                const analysis = await response.json();
                
                // Replace loading with analysis
                const analysisDiv = modalBody.querySelector('.loading-analysis');
                if (analysisDiv) {
                    analysisDiv.outerHTML = `
                        <div class="ai-analysis">
                            <h4>🤖 AI Health Analysis</h4>
                            <div class="ai-analysis-content">
                                ${analysis.result}
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error getting AI analysis:', error);
            const analysisDiv = modalBody.querySelector('.loading-analysis');
            if (analysisDiv) {
                analysisDiv.innerHTML = '<p style="color: red;">Failed to get AI analysis</p>';
            }
        }
    }
}

// Global function to close log modal
function closeLogModal() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Global function to show upgrade tab
function showUpgradeTab() {
    // Hide error message
    if (checker) {
        checker.hideError();
    }
    
    // Check if user is authenticated
    const authToken = localStorage.getItem('authToken');
    const urlParams = new URLSearchParams(window.location.search);
    const isTrial = urlParams.get('trial') === 'true';
    
    // If no token or in trial mode, redirect to login first
    if (!authToken || isTrial) {
        window.location.href = '/login';
        return;
    }
    
    // Switch to upgrade tab
    const upgradeTab = document.querySelector('[data-tab="upgrade"]');
    if (upgradeTab) {
        upgradeTab.click();
    }
}

let checker;

// Since script might be loaded dynamically, check if DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        checker = new PregnancySafetyChecker();
    });
} else {
    // DOM is already ready
    checker = new PregnancySafetyChecker();
}