class BabyMonitor {
    constructor() {
        this.babyId = null;
        this.monitoringData = null;
        this.charts = {};
        this.refreshInterval = null;
        this.init();
    }
    
    async init() {
        // Get baby ID from URL params or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        this.babyId = urlParams.get('babyId') || localStorage.getItem('activeBabyId');
        
        if (!this.babyId) {
            alert('No baby selected. Redirecting to Baibai...');
            window.location.href = '/baibai.html';
            return;
        }
        
        // Initialize tabs
        this.initializeTabs();
        
        // Initialize forms
        this.initializeForms();
        
        // Load dashboard data
        await this.loadDashboard();
        
        // Set up auto-refresh
        this.refreshInterval = setInterval(() => this.loadDashboard(), 60000); // Refresh every minute
    }
    
    initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
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
                    
                    // Load specific tab data if needed
                    if (targetTab === 'growth') {
                        this.loadGrowthChart();
                    } else if (targetTab === 'vitals') {
                        this.loadVitalsChart();
                    }
                }
            });
        });
    }
    
    initializeForms() {
        // Vitals form
        document.getElementById('vitalsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveVitals();
        });
        
        // Feeding form
        document.getElementById('feedingForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveFeeding();
        });
        
        // Diaper form
        document.getElementById('diaperForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveDiaper();
        });
        
        // Growth form
        document.getElementById('growthForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveGrowth();
        });
        
        // Medication form
        document.getElementById('medicationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveMedication();
        });
    }
    
    async loadDashboard() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                window.location.href = '/login.html';
                return;
            }
            
            const response = await fetch(`/monitoring/dashboard/${this.babyId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                // If monitoring profile doesn't exist, create it
                if (response.status === 404) {
                    await this.createMonitoringProfile();
                    return;
                }
                throw new Error('Failed to load dashboard');
            }
            
            const data = await response.json();
            this.monitoringData = data;
            
            // Update UI with dashboard data
            this.updateDashboard(data);
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showNotification('Error loading dashboard data', 'error');
        }
    }
    
    async createMonitoringProfile() {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/profile/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    riskFactors: {},
                    alertThresholds: {
                        heartRate: { min: 100, max: 160 },
                        oxygenSaturation: { min: 95 },
                        temperature: { min: 97.0, max: 100.4 },
                        respiratoryRate: { min: 30, max: 60 },
                        weightGainDaily: { min: 20 },
                        feedingInterval: { max: 4 },
                        wetDiapers: { min: 6 }
                    }
                })
            });
            
            if (response.ok) {
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error creating monitoring profile:', error);
        }
    }
    
    updateDashboard(data) {
        // Update baby info
        if (data.baby) {
            document.getElementById('babyName').textContent = data.baby.name || 'Baby';
            document.getElementById('babyAge').textContent = this.calculateAge(data.baby.birthDate);
            
            // Update risk level
            const riskLevel = data.monitoring?.riskFactors?.developmentalRisk || 'low';
            const riskElement = document.getElementById('riskLevel');
            riskElement.textContent = `Risk Level: ${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}`;
            riskElement.style.color = riskLevel === 'high' ? '#f44336' : 
                                      riskLevel === 'moderate' ? '#ff9800' : '#4caf50';
        }
        
        // Update vitals
        if (data.monitoring?.latestVitals) {
            const vitals = data.monitoring.latestVitals;
            this.updateVitalDisplay('heartRate', vitals.heartRate, 'bpm');
            this.updateVitalDisplay('oxygenSat', vitals.oxygenSaturation, '%');
            this.updateVitalDisplay('temperature', vitals.temperature, '°F');
            this.updateVitalDisplay('respRate', vitals.respiratoryRate, '/min');
            
            const time = new Date(vitals.timestamp);
            document.getElementById('lastVitalTime').textContent = `Last updated: ${time.toLocaleString()}`;
        }
        
        // Update growth stats
        if (data.monitoring?.latestGrowth) {
            const growth = data.monitoring.latestGrowth;
            if (growth.weight) {
                document.getElementById('currentWeight').textContent = `${growth.weight.value} ${growth.weight.unit}`;
            }
            if (growth.length) {
                document.getElementById('currentLength').textContent = `${growth.length.value} ${growth.length.unit}`;
            }
            if (growth.headCircumference) {
                document.getElementById('headCirc').textContent = `${growth.headCircumference.value} ${growth.headCircumference.unit}`;
            }
            
            const time = new Date(growth.date);
            document.getElementById('lastGrowthTime').textContent = `Last updated: ${time.toLocaleString()}`;
        }
        
        // Update weight gain velocity
        if (data.monitoring?.weightGainVelocity !== null) {
            const velocity = data.monitoring.weightGainVelocity;
            const element = document.getElementById('weightGain');
            element.textContent = `${velocity.toFixed(1)} g/day`;
            element.className = velocity < 20 ? 'vital-value vital-warning' : 'vital-value vital-normal';
        }
        
        // Update today's summary
        if (data.monitoring) {
            document.getElementById('todayFeedings').textContent = data.monitoring.todaysFeedings?.length || 0;
            document.getElementById('todayIntake').textContent = `${Math.round(data.monitoring.todaysFeedingTotal || 0)} ml`;
            
            const wetCount = data.monitoring.todaysDiapers?.filter(d => d.type === 'wet' || d.type === 'both').length || 0;
            const dirtyCount = data.monitoring.todaysDiapers?.filter(d => d.type === 'dirty' || d.type === 'both').length || 0;
            
            document.getElementById('todayWet').textContent = wetCount;
            document.getElementById('todayDirty').textContent = dirtyCount;
        }
        
        // Update alerts
        if (data.monitoring?.activeAlerts && data.monitoring.activeAlerts.length > 0) {
            this.updateAlerts(data.monitoring.activeAlerts);
            document.getElementById('alertCount').textContent = data.monitoring.activeAlerts.length;
            document.getElementById('alertCount').style.display = 'block';
        } else {
            document.getElementById('alertCount').style.display = 'none';
            document.getElementById('alertsList').innerHTML = '<p style="text-align: center; color: #999;">No active alerts</p>';
        }
        
        // Update feeding timeline
        if (data.monitoring?.todaysFeedings) {
            this.updateFeedingTimeline(data.monitoring.todaysFeedings);
        }
        
        // Update medications
        if (data.monitoring?.medicationsDue) {
            this.updateMedications(data.monitoring.medicationsDue);
        }

        if (data.monitoring?.recentNotes) {
            this.updateNotes(data.monitoring.recentNotes);
        }
    }
    
    updateVitalDisplay(elementId, vitalData, defaultUnit) {
        const element = document.getElementById(elementId);
        if (!vitalData || vitalData.value === undefined) {
            element.textContent = `-- ${defaultUnit}`;
            element.className = 'vital-value';
            return;
        }
        
        element.textContent = `${vitalData.value} ${vitalData.unit || defaultUnit}`;
        
        // Check thresholds and update color
        const thresholds = this.monitoringData?.monitoring?.alertThresholds;
        if (!thresholds) return;
        
        let status = 'normal';
        
        switch(elementId) {
            case 'heartRate':
                if (thresholds.heartRate) {
                    if (vitalData.value < thresholds.heartRate.min || vitalData.value > thresholds.heartRate.max) {
                        status = 'warning';
                    }
                }
                break;
            case 'oxygenSat':
                if (thresholds.oxygenSaturation && vitalData.value < thresholds.oxygenSaturation.min) {
                    status = vitalData.value < 90 ? 'critical' : 'warning';
                }
                break;
            case 'temperature':
                if (thresholds.temperature) {
                    if (vitalData.value < thresholds.temperature.min || vitalData.value > thresholds.temperature.max) {
                        status = vitalData.value > 103 ? 'critical' : 'warning';
                    }
                }
                break;
            case 'respRate':
                if (thresholds.respiratoryRate) {
                    if (vitalData.value < thresholds.respiratoryRate.min || vitalData.value > thresholds.respiratoryRate.max) {
                        status = 'warning';
                    }
                }
                break;
        }
        
        element.className = `vital-value vital-${status}`;
    }
    
    updateAlerts(alerts) {
        const alertsList = document.getElementById('alertsList');
        alertsList.innerHTML = '';
        
        alerts.forEach(alert => {
            const alertItem = document.createElement('div');
            alertItem.className = `alert-item alert-${alert.severity}`;
            alertItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${this.getAlertIcon(alert.type)} ${alert.message}</strong>
                        <p style="margin: 5px 0; color: #666; font-size: 14px;">
                            ${new Date(alert.timestamp).toLocaleString()}
                        </p>
                    </div>
                    <button onclick="acknowledgeAlert('${alert._id}')" 
                            style="padding: 5px 10px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Acknowledge
                    </button>
                </div>
            `;
            alertsList.appendChild(alertItem);
        });
    }
    
    updateFeedingTimeline(feedings) {
        const timeline = document.getElementById('feedingTimeline');
        timeline.innerHTML = '';
        
        if (feedings.length === 0) {
            timeline.innerHTML = '<p style="color: #999;">No feedings recorded today</p>';
            return;
        }
        
        feedings.reverse().forEach(feeding => {
            const item = document.createElement('div');
            item.className = 'feeding-item';
            
            const time = new Date(feeding.timestamp).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            let details = `${feeding.type}`;
            if (feeding.amount) {
                details += ` - ${feeding.amount.value} ${feeding.amount.unit}`;
            } else if (feeding.duration) {
                details += ` - ${feeding.duration} minutes`;
            }
            
            item.innerHTML = `
                <strong>${time}</strong> - ${details}
                ${feeding.notes ? `<p style="margin: 5px 0; color: #666; font-size: 14px;">${feeding.notes}</p>` : ''}
                ${feeding.issues?.length ? `<p style="margin: 5px 0; color: #ff9800; font-size: 14px;">Issues: ${feeding.issues.join(', ')}</p>` : ''}
            `;
            
            timeline.appendChild(item);
        });
    }
    
    updateMedications(medications) {
        const medicationsList = document.getElementById('medicationsList');
        medicationsList.innerHTML = '';
        
        if (medications.length === 0) {
            medicationsList.innerHTML = '<p style="color: #999;">No active medications</p>';
            return;
        }
        
        medications.forEach(med => {
            const medCard = document.createElement('div');
            medCard.className = 'monitor-card';
            medCard.innerHTML = `
                <h3>${med.name}</h3>
                <p><strong>Dosage:</strong> ${med.dosage}</p>
                <p><strong>Frequency:</strong> ${med.frequency}</p>
                <p><strong>Route:</strong> ${med.route}</p>
                ${med.purpose ? `<p><strong>Purpose:</strong> ${med.purpose}</p>` : ''}
                <button onclick="logMedicationAdmin('${med._id}')" class="btn-primary" style="margin-top: 10px;">
                    Log Administration
                </button>
            `;
            medicationsList.appendChild(medCard);
        });
    }

    updateNotes(notes) {
        const notesList = document.getElementById('notesList');
        if (!notesList) return;

        notesList.innerHTML = '';
        if (!Array.isArray(notes) || notes.length === 0) {
            notesList.innerHTML = '<p style="color: #999;">No notes recorded yet</p>';
            return;
        }

        [...notes]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach((note) => {
                const item = document.createElement('div');
                item.className = 'feeding-item';
                const mood = note.mood || 'content';
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                        <strong>${new Date(note.date).toLocaleString()}</strong>
                        <span style="font-size: 12px; color:#666; text-transform: capitalize;">Mood: ${mood}</span>
                    </div>
                    <p style="margin: 8px 0 0; color:#444;">${note.notes || ''}</p>
                `;
                notesList.appendChild(item);
            });
    }
    
    async saveVitals() {
        try {
            const vitals = {
                heartRate: { value: parseFloat(document.getElementById('vitalHeartRate').value) },
                oxygenSaturation: { value: parseFloat(document.getElementById('vitalO2').value) },
                temperature: { value: parseFloat(document.getElementById('vitalTemp').value) },
                respiratoryRate: { value: parseFloat(document.getElementById('vitalResp').value) },
                notes: document.getElementById('vitalNotes').value
            };
            
            // Remove empty values
            Object.keys(vitals).forEach(key => {
                if (key !== 'notes' && !vitals[key].value) {
                    delete vitals[key];
                }
            });
            
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/vitals/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vitals)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification('Vitals saved successfully', 'success');
                
                // Check for alerts
                if (result.alerts && result.alerts.length > 0) {
                    result.alerts.forEach(alert => {
                        this.showNotification(`Alert: ${alert.message}`, alert.severity);
                    });
                }
                
                this.closeModal('vitalsModal');
                document.getElementById('vitalsForm').reset();
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error saving vitals:', error);
            this.showNotification('Error saving vitals', 'error');
        }
    }
    
    async saveFeeding() {
        try {
            const feeding = {
                type: document.getElementById('feedingType').value,
                timestamp: new Date(),
                notes: document.getElementById('feedingNotes').value
            };
            
            if (feeding.type === 'breast') {
                feeding.duration = parseFloat(document.getElementById('feedingDuration').value);
                const side = document.getElementById('feedingSide').value;
                if (side) feeding.side = side;
            } else {
                feeding.amount = {
                    value: parseFloat(document.getElementById('feedingAmount').value),
                    unit: document.getElementById('feedingUnit').value
                };
            }
            
            const issues = document.getElementById('feedingIssues').value;
            if (issues) {
                feeding.issues = issues.split(',').map(i => i.trim());
            }
            
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/feeding/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feeding)
            });
            
            if (response.ok) {
                this.showNotification('Feeding logged successfully', 'success');
                this.closeModal('feedingModal');
                document.getElementById('feedingForm').reset();
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error saving feeding:', error);
            this.showNotification('Error saving feeding', 'error');
        }
    }
    
    async saveDiaper() {
        try {
            const diaper = {
                type: document.getElementById('diaperType').value,
                amount: document.getElementById('diaperAmount').value,
                color: document.getElementById('diaperColor').value,
                blood: document.getElementById('diaperBlood').value === 'true',
                notes: document.getElementById('diaperNotes').value,
                timestamp: new Date()
            };
            
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/diaper/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(diaper)
            });
            
            if (response.ok) {
                this.showNotification('Diaper change logged successfully', 'success');
                this.closeModal('diaperModal');
                document.getElementById('diaperForm').reset();
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error saving diaper:', error);
            this.showNotification('Error saving diaper change', 'error');
        }
    }
    
    async saveGrowth() {
        try {
            const growth = {
                weight: {
                    value: parseFloat(document.getElementById('growthWeight').value),
                    unit: document.getElementById('weightUnit').value
                },
                length: {
                    value: parseFloat(document.getElementById('growthLength').value),
                    unit: document.getElementById('lengthUnit').value
                },
                headCircumference: {
                    value: parseFloat(document.getElementById('growthHead').value),
                    unit: document.getElementById('headUnit').value
                },
                measuredBy: document.getElementById('measuredBy').value,
                notes: document.getElementById('growthNotes').value,
                date: new Date()
            };
            
            // Remove empty measurements
            if (!growth.weight.value) delete growth.weight;
            if (!growth.length.value) delete growth.length;
            if (!growth.headCircumference.value) delete growth.headCircumference;
            
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/growth/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(growth)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification('Growth measurement saved successfully', 'success');
                
                // Show weight gain velocity if available
                if (result.weightGainVelocity !== null) {
                    this.showNotification(`Weight gain: ${result.weightGainVelocity.toFixed(1)} g/day`, 'info');
                }
                
                this.closeModal('growthModal');
                document.getElementById('growthForm').reset();
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error saving growth:', error);
            this.showNotification('Error saving growth measurement', 'error');
        }
    }
    
    async saveMedication() {
        try {
            const medication = {
                name: document.getElementById('medName').value,
                dosage: document.getElementById('medDosage').value,
                frequency: document.getElementById('medFrequency').value,
                route: document.getElementById('medRoute').value,
                purpose: document.getElementById('medPurpose').value,
                prescribedBy: document.getElementById('medPrescriber').value,
                startDate: new Date()
            };
            
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/medication/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(medication)
            });
            
            if (response.ok) {
                this.showNotification('Medication added successfully', 'success');
                this.closeModal('medicationModal');
                document.getElementById('medicationForm').reset();
                await this.loadDashboard();
            }
        } catch (error) {
            console.error('Error saving medication:', error);
            this.showNotification('Error saving medication', 'error');
        }
    }
    
    calculateAge(birthDate) {
        if (!birthDate) return 'Age unknown';
        
        const birth = new Date(birthDate);
        const now = new Date();
        const ageMs = now - birth;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        
        if (ageDays < 30) {
            return `${ageDays} days old`;
        } else if (ageDays < 365) {
            const months = Math.floor(ageDays / 30);
            const days = ageDays % 30;
            return `${months} month${months > 1 ? 's' : ''} ${days} day${days !== 1 ? 's' : ''} old`;
        } else {
            const years = Math.floor(ageDays / 365);
            const months = Math.floor((ageDays % 365) / 30);
            return `${years} year${years > 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''} old`;
        }
    }
    
    getAlertIcon(type) {
        const icons = {
            vital: '❤️',
            growth: '📊',
            feeding: '🍼',
            medication: '💊',
            milestone: '🎯',
            appointment: '📅'
        };
        return icons[type] || '⚠️';
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#f44336' : 
                         type === 'success' ? '#4caf50' : 
                         type === 'warning' ? '#ff9800' : '#2196f3'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }
    
    async loadGrowthChart() {
        if (typeof Chart === 'undefined') {
            return;
        }

        const chartCanvas = document.getElementById('growthChart');
        if (!chartCanvas) return;

        const growth = this.monitoringData?.monitoring?.recentGrowth || [];
        if (!growth.length) return;

        const labels = growth.map((entry) => new Date(entry.date).toLocaleDateString());
        const weightData = growth.map((entry) => entry.weight?.value ?? null);
        const lengthData = growth.map((entry) => entry.length?.value ?? null);

        if (this.charts.growthChart) {
            this.charts.growthChart.destroy();
        }

        this.charts.growthChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Weight',
                        data: weightData,
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        spanGaps: true
                    },
                    {
                        label: 'Length',
                        data: lengthData,
                        borderColor: '#2196f3',
                        backgroundColor: 'rgba(33, 150, 243, 0.2)',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    async loadVitalsChart() {
        if (typeof Chart === 'undefined') {
            return;
        }

        const chartCanvas = document.getElementById('vitalsChart');
        if (!chartCanvas) return;

        const vitals = this.monitoringData?.monitoring?.recentVitals || [];
        if (!vitals.length) return;

        const labels = vitals.map((entry) => new Date(entry.timestamp).toLocaleTimeString());
        const heartRate = vitals.map((entry) => entry.heartRate?.value ?? null);
        const oxygen = vitals.map((entry) => entry.oxygenSaturation?.value ?? null);
        const temp = vitals.map((entry) => entry.temperature?.value ?? null);

        if (this.charts.vitalsChart) {
            this.charts.vitalsChart.destroy();
        }

        this.charts.vitalsChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Heart Rate',
                        data: heartRate,
                        borderColor: '#f44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.2)',
                        spanGaps: true
                    },
                    {
                        label: 'Oxygen Saturation',
                        data: oxygen,
                        borderColor: '#9c27b0',
                        backgroundColor: 'rgba(156, 39, 176, 0.2)',
                        spanGaps: true
                    },
                    {
                        label: 'Temperature',
                        data: temp,
                        borderColor: '#ff9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.2)',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    async saveDailyNotes(notes) {
        const trimmed = (notes || '').trim();
        if (!trimmed) {
            this.showNotification('Please enter some notes', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/monitoring/notes/${this.babyId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    notes: trimmed,
                    date: new Date().toISOString(),
                    mood: 'content'
                })
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.error || 'Failed to save notes');
            }

            this.showNotification('Notes saved successfully', 'success');
            document.getElementById('dailyNotes').value = '';
            await this.loadDashboard();
        } catch (error) {
            console.error('Error saving notes:', error);
            this.showNotification(error.message || 'Error saving notes', 'error');
        }
    }
}

// Global functions for HTML onclick handlers
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function updateFeedingFields() {
    const type = document.getElementById('feedingType').value;
    const durationGroup = document.getElementById('durationGroup');
    const amountGroup = document.getElementById('amountGroup');
    const sideGroup = document.getElementById('sideGroup');
    
    if (type === 'breast') {
        durationGroup.style.display = 'block';
        amountGroup.style.display = 'none';
        sideGroup.style.display = 'block';
    } else {
        durationGroup.style.display = 'none';
        amountGroup.style.display = 'grid';
        sideGroup.style.display = 'none';
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const monitor = window.babyMonitor;
        const token = localStorage.getItem('authToken');
        
        const response = await fetch(`/monitoring/alert/${monitor.babyId}/${alertId}/acknowledge`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                acknowledgedBy: 'User',
                actionTaken: 'Reviewed and acknowledged'
            })
        });
        
        if (response.ok) {
            monitor.showNotification('Alert acknowledged', 'success');
            await monitor.loadDashboard();
        }
    } catch (error) {
        console.error('Error acknowledging alert:', error);
    }
}

async function exportData() {
    try {
        const monitor = window.babyMonitor;
        const token = localStorage.getItem('authToken');
        
        const response = await fetch(`/monitoring/export/${monitor.babyId}?format=csv`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `baby-monitoring-${monitor.babyId}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            monitor.showNotification('Data exported successfully', 'success');
        }
    } catch (error) {
        console.error('Error exporting data:', error);
    }
}

function callEmergency() {
    if (confirm('Call emergency services?')) {
        window.location.href = 'tel:911';
    }
}

async function saveNotes() {
    const monitor = window.babyMonitor;
    const notes = document.getElementById('dailyNotes').value;
    await monitor.saveDailyNotes(notes);
}

// Initialize the monitor when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.babyMonitor = new BabyMonitor();
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
`;
document.head.appendChild(style);