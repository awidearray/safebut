const mongoose = require('mongoose');

const vitalSignSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    heartRate: { value: Number, unit: { type: String, default: 'bpm' } },
    oxygenSaturation: { value: Number, unit: { type: String, default: '%' } },
    temperature: { value: Number, unit: { type: String, default: 'F' } },
    respiratoryRate: { value: Number, unit: { type: String, default: 'breaths/min' } },
    bloodPressure: {
        systolic: Number,
        diastolic: Number,
        unit: { type: String, default: 'mmHg' }
    },
    bloodGlucose: { value: Number, unit: { type: String, default: 'mg/dL' } },
    notes: String
});

const growthMeasurementSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    weight: {
        value: Number,
        unit: { type: String, enum: ['kg', 'lbs', 'g'], default: 'kg' },
        percentile: Number
    },
    length: {
        value: Number,
        unit: { type: String, enum: ['cm', 'inches'], default: 'cm' },
        percentile: Number
    },
    headCircumference: {
        value: Number,
        unit: { type: String, enum: ['cm', 'inches'], default: 'cm' },
        percentile: Number
    },
    adjustedAge: {
        weeks: Number,
        days: Number
    },
    measuredBy: String,
    notes: String
});

const feedingRecordSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['breast', 'bottle', 'tube', 'mixed', 'solids'], 
        required: true 
    },
    duration: Number, // minutes for breast, ml/oz for bottle
    amount: {
        value: Number,
        unit: { type: String, enum: ['ml', 'oz'] }
    },
    side: { type: String, enum: ['left', 'right', 'both'] }, // for breastfeeding
    formula: String, // formula brand if applicable
    fortification: Boolean, // if fortified breast milk or formula
    calories: Number,
    issues: [String], // ['reflux', 'vomiting', 'refused', 'poor latch']
    notes: String
});

const diaperRecordSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['wet', 'dirty', 'both'], required: true },
    color: String,
    consistency: String,
    amount: { type: String, enum: ['small', 'medium', 'large'] },
    blood: Boolean,
    notes: String
});

const medicationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    route: { type: String, enum: ['oral', 'IV', 'IM', 'topical', 'inhaled', 'rectal'] },
    startDate: Date,
    endDate: Date,
    purpose: String,
    prescribedBy: String,
    reminders: [{
        time: String, // "09:00", "21:00"
        enabled: { type: Boolean, default: true }
    }],
    administrationLog: [{
        timestamp: Date,
        given: Boolean,
        givenBy: String,
        notes: String
    }]
});

const alertSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    type: { 
        type: String, 
        enum: ['vital', 'growth', 'feeding', 'medication', 'milestone', 'appointment'],
        required: true 
    },
    severity: { 
        type: String, 
        enum: ['low', 'medium', 'high', 'critical'], 
        required: true 
    },
    message: String,
    data: mongoose.Schema.Types.Mixed,
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: String,
    acknowledgedAt: Date,
    actionTaken: String
});

const babyMonitoringSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    babyId: { type: String, required: true }, // Links to baby profile in User model
    
    // Risk factors and medical history
    riskFactors: {
        gestationalAge: Number, // weeks at birth
        birthWeight: Number, // grams
        nicuGraduate: Boolean,
        nicuStayDays: Number,
        diagnoses: [String], // ['RDS', 'BPD', 'IVH', 'NEC', 'ROP']
        surgeries: [String],
        currentConditions: [String],
        developmentalRisk: { 
            type: String, 
            enum: ['low', 'moderate', 'high'], 
            default: 'low' 
        }
    },
    
    // Alert thresholds (customizable per baby)
    alertThresholds: {
        heartRate: { min: Number, max: Number },
        oxygenSaturation: { min: Number },
        temperature: { min: Number, max: Number },
        respiratoryRate: { min: Number, max: Number },
        weightGainDaily: { min: Number }, // grams per day
        feedingInterval: { max: Number }, // hours
        wetDiapers: { min: Number }, // per 24 hours
    },
    
    // Monitoring data
    vitalSigns: [vitalSignSchema],
    growthMeasurements: [growthMeasurementSchema],
    feedingRecords: [feedingRecordSchema],
    diaperRecords: [diaperRecordSchema],
    medications: [medicationSchema],
    alerts: [alertSchema],
    
    // Sleep tracking
    sleepSessions: [{
        startTime: Date,
        endTime: Date,
        quality: { type: String, enum: ['good', 'fair', 'poor'] },
        location: String, // 'crib', 'bassinet', 'parent bed'
        notes: String
    }],
    
    // Developmental milestones (adjusted for corrected age)
    milestones: [{
        category: { 
            type: String, 
            enum: ['motor', 'cognitive', 'language', 'social'] 
        },
        milestone: String,
        expectedAge: { months: Number, adjusted: Boolean },
        achievedDate: Date,
        notes: String
    }],
    
    // Healthcare team
    healthcareTeam: [{
        role: String, // 'Pediatrician', 'Specialist', 'Therapist'
        name: String,
        phone: String,
        email: String,
        lastVisit: Date,
        nextVisit: Date,
        notes: String
    }],
    
    // Emergency contacts
    emergencyContacts: [{
        name: String,
        relationship: String,
        phone: String,
        priority: Number
    }],
    
    // Daily care notes
    dailyNotes: [{
        date: { type: Date, default: Date.now },
        mood: { type: String, enum: ['happy', 'content', 'fussy', 'irritable'] },
        activity: String,
        concerns: [String],
        photos: [String], // URLs to uploaded photos
        notes: String
    }],
    
    // Reports and exports
    reports: [{
        generatedAt: Date,
        type: { type: String, enum: ['weekly', 'monthly', 'custom'] },
        dateRange: { start: Date, end: Date },
        fileUrl: String,
        sharedWith: [String]
    }],
    
    // Settings
    settings: {
        notifications: {
            enabled: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        },
        units: {
            weight: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
            temperature: { type: String, enum: ['celsius', 'fahrenheit'], default: 'fahrenheit' }
        },
        timezone: String,
        language: { type: String, default: 'en' }
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
babyMonitoringSchema.index({ userId: 1, babyId: 1 });
babyMonitoringSchema.index({ 'vitalSigns.timestamp': -1 });
babyMonitoringSchema.index({ 'growthMeasurements.date': -1 });
babyMonitoringSchema.index({ 'alerts.timestamp': -1, 'alerts.acknowledged': 1 });

// Methods to calculate statistics
babyMonitoringSchema.methods.getLatestVitals = function() {
    return this.vitalSigns.length > 0 
        ? this.vitalSigns[this.vitalSigns.length - 1] 
        : null;
};

babyMonitoringSchema.methods.getLatestGrowth = function() {
    return this.growthMeasurements.length > 0 
        ? this.growthMeasurements[this.growthMeasurements.length - 1] 
        : null;
};

babyMonitoringSchema.methods.getTodaysFeedingTotal = function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.feedingRecords
        .filter(record => record.timestamp >= today)
        .reduce((total, record) => {
            if (record.amount && record.amount.value) {
                const amount = record.amount.unit === 'oz' 
                    ? record.amount.value * 29.5735 
                    : record.amount.value;
                return total + amount;
            }
            return total;
        }, 0);
};

babyMonitoringSchema.methods.getWeightGainVelocity = function(days = 7) {
    const measurements = this.growthMeasurements
        .filter(m => m.weight && m.weight.value)
        .sort((a, b) => a.date - b.date);
    
    if (measurements.length < 2) return null;
    
    const recent = measurements.slice(-Math.min(days + 1, measurements.length));
    if (recent.length < 2) return null;
    
    const first = recent[0];
    const last = recent[recent.length - 1];
    const daysDiff = (last.date - first.date) / (1000 * 60 * 60 * 24);
    
    if (daysDiff === 0) return null;
    
    // Convert to grams for calculation
    const firstWeight = first.weight.unit === 'kg' ? first.weight.value * 1000 :
                        first.weight.unit === 'lbs' ? first.weight.value * 453.592 :
                        first.weight.value;
    
    const lastWeight = last.weight.unit === 'kg' ? last.weight.value * 1000 :
                       last.weight.unit === 'lbs' ? last.weight.value * 453.592 :
                       last.weight.value;
    
    return (lastWeight - firstWeight) / daysDiff; // grams per day
};

babyMonitoringSchema.methods.checkAlertThresholds = function(vitalSign) {
    const alerts = [];
    const thresholds = this.alertThresholds;
    
    if (vitalSign.heartRate && thresholds.heartRate) {
        if (vitalSign.heartRate.value < thresholds.heartRate.min) {
            alerts.push({
                type: 'vital',
                severity: 'high',
                message: `Low heart rate: ${vitalSign.heartRate.value} bpm`
            });
        } else if (vitalSign.heartRate.value > thresholds.heartRate.max) {
            alerts.push({
                type: 'vital',
                severity: 'high',
                message: `High heart rate: ${vitalSign.heartRate.value} bpm`
            });
        }
    }
    
    if (vitalSign.oxygenSaturation && thresholds.oxygenSaturation) {
        if (vitalSign.oxygenSaturation.value < thresholds.oxygenSaturation.min) {
            alerts.push({
                type: 'vital',
                severity: vitalSign.oxygenSaturation.value < 90 ? 'critical' : 'high',
                message: `Low oxygen saturation: ${vitalSign.oxygenSaturation.value}%`
            });
        }
    }
    
    if (vitalSign.temperature && thresholds.temperature) {
        if (vitalSign.temperature.value < thresholds.temperature.min) {
            alerts.push({
                type: 'vital',
                severity: 'medium',
                message: `Low temperature: ${vitalSign.temperature.value}°F`
            });
        } else if (vitalSign.temperature.value > thresholds.temperature.max) {
            alerts.push({
                type: 'vital',
                severity: vitalSign.temperature.value > 103 ? 'high' : 'medium',
                message: `High temperature: ${vitalSign.temperature.value}°F`
            });
        }
    }
    
    return alerts;
};

// Pre-save hook to update timestamp
babyMonitoringSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('BabyMonitoring', babyMonitoringSchema);