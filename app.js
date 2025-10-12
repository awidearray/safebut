class PregnancySafetyChecker {
    constructor() {
        this.searchHistory = JSON.parse(localStorage.getItem('pregnancySafetyHistory') || '[]');
        this.capturedImage = null;
        this.initializeEventListeners();
        this.displayHistory();
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

        const reader = new FileReader();
        reader.onload = (e) => {
            const imagePreview = document.getElementById('imagePreview');
            const capturedImage = document.getElementById('capturedImage');
            const searchInput = document.getElementById('searchInput');
            
            capturedImage.src = e.target.result;
            imagePreview.style.display = 'block';
            this.capturedImage = e.target.result;
            
            // Clear text input when image is selected
            searchInput.value = '';
            searchInput.placeholder = 'Analyzing image...';
            
            // Automatically analyze the image
            this.performSearch();
        };
        reader.readAsDataURL(file);
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
        const response = await fetch('/api/check-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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
        const response = await fetch('/api/check-image-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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
        const historySection = document.getElementById('historySection');
        const historyItems = document.getElementById('historyItems');

        if (this.searchHistory.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        
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
document.addEventListener('DOMContentLoaded', () => {
    checker = new PregnancySafetyChecker();
});