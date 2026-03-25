class BaibaiDoula {
    constructor() {
        this.babyProfiles = [];
        this.activeBabyId = null;
        this.searchHistory = JSON.parse(localStorage.getItem('baibaiHistory') || '[]');
        this.parentProfile = JSON.parse(localStorage.getItem('baibaiParentProfile') || '{}');
        this.capturedImage = null;
        this.initializeTabs();
        this.initializeEventListeners();
        this.loadBabyProfiles();
        this.loadParentProfile();
        this.displayHistory();
    }
    
    initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            if (button.id === 'logoutBtn') return;
            
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => {
                    content.style.display = 'none';
                    content.classList.remove('active');
                });
                
                button.classList.add('active');
                
                const targetContent = document.getElementById(targetTab + 'Tab');
                if (targetContent) {
                    targetContent.style.display = 'block';
                    targetContent.classList.add('active');
                    
                    if (targetTab === 'milestones') {
                        this.loadMilestones();
                    }
                }
            });
        });
    }
    
    initializeEventListeners() {
        // Search functionality
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
        
        clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        
        // Camera functionality
        cameraBtn.addEventListener('click', () => {
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
        
        removeImageBtn.addEventListener('click', () => this.removeImage());
        
        // Baby profile management
        const addBabyBtn = document.getElementById('addBabyBtn');
        const saveBabyBtn = document.getElementById('saveBabyProfile');
        const cancelBabyBtn = document.getElementById('cancelBabyProfile');
        
        addBabyBtn.addEventListener('click', () => this.showBabyForm());
        saveBabyBtn.addEventListener('click', () => this.saveBabyProfile());
        cancelBabyBtn.addEventListener('click', () => this.hideBabyForm());
        
        // Parent profile
        const saveParentBtn = document.getElementById('saveParentProfile');
        saveParentBtn.addEventListener('click', () => this.saveParentProfile());
        
        // Baby selector
        const activeBabySelect = document.getElementById('activeBabySelect');
        activeBabySelect.addEventListener('change', (e) => {
            this.activeBabyId = e.target.value;
            localStorage.setItem('activeBabyId', this.activeBabyId);
        });
    }
    
    async loadBabyProfiles() {
        const authToken = localStorage.getItem('authToken');
        
        try {
            const response = await fetch('/api/baby-profiles', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.babyProfiles = data.profiles || [];
                this.displayBabyProfiles();
                this.updateBabySelectors();
                
                // Set active baby
                const savedActiveBaby = localStorage.getItem('activeBabyId');
                if (savedActiveBaby && this.babyProfiles.find(b => b.id === savedActiveBaby)) {
                    this.activeBabyId = savedActiveBaby;
                    document.getElementById('activeBabySelect').value = savedActiveBaby;
                }
            }
        } catch (error) {
            console.error('Failed to load baby profiles:', error);
        }
    }
    
    displayBabyProfiles() {
        const profilesList = document.getElementById('babyProfilesList');
        
        if (this.babyProfiles.length === 0) {
            profilesList.innerHTML = `
                <div class="no-profiles">
                    <p>No baby profiles yet. Add your first baby!</p>
                </div>
            `;
            return;
        }
        
        profilesList.innerHTML = this.babyProfiles.map(baby => `
            <div class="baby-profile-card" data-baby-id="${baby.id}">
                <div class="baby-info">
                    <h3>${baby.name}</h3>
                    <p>Age: ${this.calculateAge(baby.birthDate)}</p>
                    <p>Born: ${new Date(baby.birthDate).toLocaleDateString()}</p>
                    ${baby.weight ? `<p>Weight: ${baby.weight.value} ${baby.weight.unit}</p>` : ''}
                    ${baby.length ? `<p>Length: ${baby.length.value} ${baby.length.unit}</p>` : ''}
                </div>
                <div class="profile-actions">
                    <button onclick="baibaiApp.editBaby('${baby.id}')">✏️ Edit</button>
                    <button onclick="baibaiApp.deleteBaby('${baby.id}')" class="delete-btn">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    }
    
    updateBabySelectors() {
        const activeBabySelect = document.getElementById('activeBabySelect');
        const milestoneBabySelect = document.getElementById('milestoneBabySelect');
        
        const options = '<option value="">Select baby profile...</option>' + 
            this.babyProfiles.map(baby => 
                `<option value="${baby.id}">${baby.name} (${this.calculateAge(baby.birthDate)})</option>`
            ).join('');
        
        activeBabySelect.innerHTML = options;
        milestoneBabySelect.innerHTML = options;
    }
    
    calculateAge(birthDate) {
        const birth = new Date(birthDate);
        const now = new Date();
        const diffMs = now - birth;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays < 30) {
            return `${diffDays} days`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            const days = diffDays % 30;
            return `${months} month${months > 1 ? 's' : ''} ${days > 0 ? days + ' days' : ''}`.trim();
        } else {
            const years = Math.floor(diffDays / 365);
            const months = Math.floor((diffDays % 365) / 30);
            return `${years} year${years > 1 ? 's' : ''} ${months > 0 ? months + ' months' : ''}`.trim();
        }
    }
    
    showBabyForm(babyId = null) {
        const form = document.getElementById('babyProfileForm');
        const formTitle = document.getElementById('formTitle');
        
        if (babyId) {
            const baby = this.babyProfiles.find(b => b.id === babyId);
            if (baby) {
                formTitle.textContent = 'Edit Baby Profile';
                document.getElementById('baby-name').value = baby.name || '';
                document.getElementById('birth-date').value = baby.birthDate ? baby.birthDate.split('T')[0] : '';
                document.getElementById('baby-gender').value = baby.gender || '';
                // Load other fields...
                form.dataset.editId = babyId;
            }
        } else {
            formTitle.textContent = 'Add New Baby';
            form.dataset.editId = '';
            // Reset form
            form.querySelectorAll('input, select, textarea').forEach(field => {
                field.value = '';
            });
        }
        
        form.style.display = 'block';
        document.getElementById('addBabyBtn').style.display = 'none';
    }
    
    hideBabyForm() {
        document.getElementById('babyProfileForm').style.display = 'none';
        document.getElementById('addBabyBtn').style.display = 'block';
    }
    
    async saveBabyProfile() {
        const form = document.getElementById('babyProfileForm');
        const editId = form.dataset.editId;
        
        const babyData = {
            name: document.getElementById('baby-name').value,
            birthDate: document.getElementById('birth-date').value,
            gender: document.getElementById('baby-gender').value,
            weight: {
                value: parseFloat(document.getElementById('baby-weight').value) || null,
                unit: document.getElementById('weight-unit').value
            },
            length: {
                value: parseFloat(document.getElementById('baby-length').value) || null,
                unit: document.getElementById('length-unit').value
            },
            headCircumference: {
                value: parseFloat(document.getElementById('head-circumference').value) || null,
                unit: document.getElementById('head-unit').value
            },
            bloodType: document.getElementById('blood-type').value,
            eyeColor: document.getElementById('eye-color').value,
            knownAllergies: document.getElementById('known-allergies').value.split(',').map(a => a.trim()).filter(a => a),
            medicalConditions: document.getElementById('medical-conditions').value.split(',').map(c => c.trim()).filter(c => c),
            medications: document.getElementById('medications').value.split(',').map(m => m.trim()).filter(m => m),
            sleepHabits: {
                averageHours: parseFloat(document.getElementById('sleep-hours').value) || null,
                nightWakings: parseInt(document.getElementById('night-wakings').value) || 0
            },
            feedingInfo: {
                type: document.getElementById('feeding-type').value
            },
            pediatrician: {
                name: document.getElementById('pediatrician-name').value,
                phone: document.getElementById('pediatrician-phone').value
            }
        };
        
        const authToken = localStorage.getItem('authToken');
        const url = editId ? `/api/baby-profiles/${editId}` : '/api/baby-profiles';
        const method = editId ? 'PUT' : 'POST';
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(babyData)
            });
            
            if (response.ok) {
                this.hideBabyForm();
                this.loadBabyProfiles();
                this.showSuccess('Baby profile saved successfully!');
            } else {
                this.showError('Failed to save baby profile');
            }
        } catch (error) {
            console.error('Error saving baby profile:', error);
            this.showError('Failed to save baby profile');
        }
    }
    
    async deleteBaby(babyId) {
        if (!confirm('Are you sure you want to delete this baby profile?')) {
            return;
        }
        
        const authToken = localStorage.getItem('authToken');
        
        try {
            const response = await fetch(`/api/baby-profiles/${babyId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                this.loadBabyProfiles();
                this.showSuccess('Baby profile deleted');
            }
        } catch (error) {
            console.error('Error deleting baby:', error);
            this.showError('Failed to delete baby profile');
        }
    }
    
    editBaby(babyId) {
        this.showBabyForm(babyId);
    }
    
    async performSearch() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();
        
        if (!this.activeBabyId && !this.capturedImage) {
            this.showError('Please select a baby profile first');
            return;
        }
        
        if (!query && !this.capturedImage) {
            this.showError('Please enter something to check or take a photo');
            return;
        }
        
        this.showLoading(true);
        this.hideError();
        this.hideResults();
        
        try {
            const activeBaby = this.babyProfiles.find(b => b.id === this.activeBabyId);
            const babyAgeMonths = activeBaby ? this.getAgeInMonths(activeBaby.birthDate) : null;
            
            let result;
            if (this.capturedImage) {
                result = await this.checkImageSafety(this.capturedImage, babyAgeMonths);
                this.addToHistory('Photo Analysis', result.riskScore);
            } else {
                result = await this.checkBabySafety(query, babyAgeMonths);
                this.addToHistory(query, result.riskScore);
            }
            
            this.displayResults(query || 'Analyzed Image', result);
        } catch (error) {
            console.error('Error:', error);
            
            if (error.message.includes('Daily limit reached')) {
                this.showUpgradePrompt();
            } else {
                this.showError('Failed to check safety. Please try again.');
            }
        } finally {
            this.showLoading(false);
        }
    }
    
    getAgeInMonths(birthDate) {
        const birth = new Date(birthDate);
        const now = new Date();
        const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
        return Math.max(0, months);
    }
    
    async checkBabySafety(item, babyAgeMonths) {
        const authToken = localStorage.getItem('authToken');
        const parentProfile = this.parentProfile;
        
        const response = await fetch('/api/baby-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                item: item,
                babyAgeMonths: babyAgeMonths,
                isBreastfeeding: parentProfile.breastfeedingStatus && parentProfile.breastfeedingStatus !== 'not'
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }
        
        return await response.json();
    }
    
    async checkImageSafety(imageData, babyAgeMonths) {
        const authToken = localStorage.getItem('authToken');
        const parentProfile = this.parentProfile;
        
        const response = await fetch('/api/baby-image-safety', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                image: imageData,
                babyAgeMonths: babyAgeMonths,
                isBreastfeeding: parentProfile.breastfeedingStatus && parentProfile.breastfeedingStatus !== 'not'
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }
        
        return await response.json();
    }
    
    displayResults(item, data) {
        const resultsSection = document.getElementById('results');
        const itemName = document.getElementById('itemName');
        const safetyBadge = document.getElementById('safetyBadge');
        const resultContent = document.getElementById('resultContent');
        const riskIndicator = document.getElementById('riskIndicator');
        const safetyVerdict = document.getElementById('safetyVerdict');
        const ageRecommendation = document.getElementById('ageRecommendation');
        const ageContent = document.getElementById('ageContent');
        
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
        
        // Set safety verdict for babies
        if (riskScore <= 2) {
            safetyVerdict.textContent = '✅ VERY SAFE - This is considered very safe for babies';
            safetyVerdict.className = 'safety-verdict safe';
        } else if (riskScore <= 4) {
            safetyVerdict.textContent = '✅ SAFE - This is generally considered safe for babies';
            safetyVerdict.className = 'safety-verdict safe';
        } else if (riskScore === 5) {
            safetyVerdict.textContent = '⚖️ USE CAUTION - Consider baby\'s age and development';
            safetyVerdict.className = 'safety-verdict caution';
        } else if (riskScore <= 8) {
            safetyVerdict.textContent = '⚠️ CAUTION REQUIRED - This may pose risks to babies';
            safetyVerdict.className = 'safety-verdict caution';
        } else {
            safetyVerdict.textContent = '❌ UNSAFE - This should be avoided for babies';
            safetyVerdict.className = 'safety-verdict unsafe';
        }
        
        // Show age recommendations if provided
        if (data.ageRecommendation) {
            ageContent.innerHTML = this.formatContent(data.ageRecommendation);
            ageRecommendation.style.display = 'block';
        } else {
            ageRecommendation.style.display = 'none';
        }
        
        resultContent.innerHTML = this.formatContent(data.result);
        resultsSection.style.display = 'block';
    }
    
    formatContent(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
    }
    
    extractSafetyLevel(result) {
        const text = result.toLowerCase();
        if (text.includes('very safe') || text.includes('completely safe')) {
            return { text: 'Very Safe', class: 'safe' };
        } else if (text.includes('generally safe') || text.includes('considered safe')) {
            return { text: 'Safe', class: 'safe' };
        } else if (text.includes('caution') || text.includes('careful')) {
            return { text: 'Use Caution', class: 'caution' };
        } else if (text.includes('unsafe') || text.includes('avoid') || text.includes('dangerous')) {
            return { text: 'Unsafe', class: 'unsafe' };
        } else {
            return { text: 'Check Details', class: 'neutral' };
        }
    }
    
    getRiskColor(score) {
        if (score <= 3) return '#22c55e';
        if (score <= 6) return '#f59e0b';
        return '#ef4444';
    }
    
    async handleImageCapture(file) {
        if (!file) return;
        
        const isPremium = localStorage.getItem('isPremium') === 'true';
        if (!isPremium) {
            this.showUpgradePrompt();
            return;
        }
        
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
        searchInput.placeholder = 'Enter anything to check if it\'s safe for bebe';
    }
    
    saveParentProfile() {
        const profile = {
            name: document.getElementById('parent-name').value,
            deliveryDate: document.getElementById('delivery-date').value,
            deliveryType: document.getElementById('delivery-type').value,
            breastfeedingStatus: document.getElementById('breastfeeding-status').value,
            conditions: []
        };
        
        document.querySelectorAll('input[name="postpartum-conditions"]:checked').forEach(input => {
            profile.conditions.push(input.id);
        });
        
        this.parentProfile = profile;
        localStorage.setItem('baibaiParentProfile', JSON.stringify(profile));
        
        const saveBtn = document.getElementById('saveParentProfile');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✅ Saved!';
        saveBtn.style.background = '#48bb78';
        
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '';
        }, 2000);
    }
    
    loadParentProfile() {
        const profile = this.parentProfile;
        if (!profile || Object.keys(profile).length === 0) return;
        
        if (profile.name) document.getElementById('parent-name').value = profile.name;
        if (profile.deliveryDate) document.getElementById('delivery-date').value = profile.deliveryDate;
        if (profile.deliveryType) document.getElementById('delivery-type').value = profile.deliveryType;
        if (profile.breastfeedingStatus) document.getElementById('breastfeeding-status').value = profile.breastfeedingStatus;
        
        if (profile.conditions) {
            profile.conditions.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
        }
    }
    
    addToHistory(item, riskScore) {
        this.searchHistory.unshift({
            item: item,
            riskScore: riskScore,
            timestamp: new Date().toISOString(),
            babyId: this.activeBabyId
        });
        
        if (this.searchHistory.length > 50) {
            this.searchHistory = this.searchHistory.slice(0, 50);
        }
        
        localStorage.setItem('baibaiHistory', JSON.stringify(this.searchHistory));
        this.displayHistory();
    }
    
    displayHistory() {
        const historyItems = document.getElementById('historyItems');
        
        if (this.searchHistory.length === 0) {
            historyItems.innerHTML = '<p>No search history yet</p>';
            return;
        }
        
        historyItems.innerHTML = this.searchHistory.map(item => {
            const date = new Date(item.timestamp);
            const baby = this.babyProfiles.find(b => b.id === item.babyId);
            return `
                <div class="history-item">
                    <div class="history-content">
                        <strong>${item.item}</strong>
                        ${baby ? `<span class="baby-tag">${baby.name}</span>` : ''}
                        <span class="risk-score">Risk: ${item.riskScore}/10</span>
                    </div>
                    <div class="history-date">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                </div>
            `;
        }).join('');
    }
    
    clearHistory() {
        if (confirm('Are you sure you want to clear all search history?')) {
            this.searchHistory = [];
            localStorage.setItem('baibaiHistory', '[]');
            this.displayHistory();
        }
    }
    
    loadMilestones() {
        const select = document.getElementById('milestoneBabySelect');
        const content = document.getElementById('milestonesContent');
        
        if (!select.value) {
            content.innerHTML = '<p>Please select a baby to view milestones</p>';
            return;
        }
        
        const baby = this.babyProfiles.find(b => b.id === select.value);
        if (!baby) return;
        
        const ageMonths = this.getAgeInMonths(baby.birthDate);
        
        const milestones = this.getMilestonesForAge(ageMonths);
        
        content.innerHTML = `
            <h3>Milestones for ${baby.name} (${this.calculateAge(baby.birthDate)})</h3>
            <div class="milestones-list">
                ${milestones.map(milestone => `
                    <div class="milestone-item">
                        <input type="checkbox" id="milestone-${milestone.id}" 
                            ${baby.developmentalMilestones?.find(m => m.milestone === milestone.text)?.achieved ? 'checked' : ''}>
                        <label for="milestone-${milestone.id}">${milestone.text}</label>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    getMilestonesForAge(ageMonths) {
        const milestones = [
            { age: 2, text: 'Smiles at people', id: 'smile' },
            { age: 2, text: 'Can briefly calm self', id: 'calm' },
            { age: 4, text: 'Holds head steady', id: 'head' },
            { age: 4, text: 'Coos, makes gurgling sounds', id: 'coo' },
            { age: 6, text: 'Rolls over in both directions', id: 'roll' },
            { age: 6, text: 'Begins to sit without support', id: 'sit' },
            { age: 9, text: 'Stands, holding on', id: 'stand' },
            { age: 9, text: 'Says "mama" and "dada"', id: 'words' },
            { age: 12, text: 'Walks alone', id: 'walk' },
            { age: 12, text: 'Says several single words', id: 'talk' }
        ];
        
        return milestones.filter(m => m.age <= ageMonths + 3);
    }
    
    showLoading(show) {
        const loader = document.querySelector('.loader');
        const btnText = document.querySelector('.btn-text');
        
        if (loader && btnText) {
            loader.style.display = show ? 'inline-block' : 'none';
            btnText.style.display = show ? 'none' : 'inline-block';
        }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error');
        const errorText = document.getElementById('errorText');
        
        errorText.textContent = message;
        errorDiv.style.display = 'block';
    }
    
    hideError() {
        document.getElementById('error').style.display = 'none';
    }
    
    hideResults() {
        document.getElementById('results').style.display = 'none';
    }
    
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }
    
    showUpgradePrompt() {
        alert('This feature requires a premium account. Please upgrade to access camera functionality and unlimited searches.');
        window.location.href = '/app.html#upgrade';
    }
}

// Initialize the app
const baibaiApp = new BaibaiDoula();