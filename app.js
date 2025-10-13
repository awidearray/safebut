class PregnancySafetyChecker {
    constructor() {
        this.searchHistory = JSON.parse(localStorage.getItem('pregnancySafetyHistory') || '[]');
        this.capturedImage = null;
        this.initializeTabs();
        this.initializeEventListeners();
        this.initializeProfile();
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
            trimester: document.querySelector('input[name="trimester"]:checked')?.value
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
        } catch (error) {
            this.showError('Failed to check safety. Please try again.');
            console.error('Error:', error);
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