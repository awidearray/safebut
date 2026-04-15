const express = require('express');
const router = express.Router();
const BabyMonitoring = require('../models/BabyMonitoring');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

const DEFAULT_ALERT_THRESHOLDS = {
    heartRate: { min: 100, max: 160 },
    oxygenSaturation: { min: 95 },
    temperature: { min: 97.0, max: 100.4 },
    respiratoryRate: { min: 30, max: 60 },
    weightGainDaily: { min: 20 },
    feedingInterval: { max: 4 },
    wetDiapers: { min: 6 }
};

const GROWTH_CHARTS = {
    weight: [
        { weeks: 0, p50: 3.3, sd: 0.5, unit: 'kg' },
        { weeks: 4, p50: 4.2, sd: 0.6, unit: 'kg' },
        { weeks: 8, p50: 5.0, sd: 0.65, unit: 'kg' },
        { weeks: 12, p50: 5.8, sd: 0.7, unit: 'kg' },
        { weeks: 16, p50: 6.4, sd: 0.75, unit: 'kg' },
        { weeks: 20, p50: 7.0, sd: 0.8, unit: 'kg' },
        { weeks: 24, p50: 7.5, sd: 0.85, unit: 'kg' },
        { weeks: 36, p50: 8.9, sd: 0.95, unit: 'kg' },
        { weeks: 52, p50: 9.6, sd: 1.05, unit: 'kg' },
        { weeks: 78, p50: 11.5, sd: 1.2, unit: 'kg' },
        { weeks: 104, p50: 12.7, sd: 1.3, unit: 'kg' }
    ],
    length: [
        { weeks: 0, p50: 49.9, sd: 1.9, unit: 'cm' },
        { weeks: 4, p50: 53.7, sd: 2.0, unit: 'cm' },
        { weeks: 8, p50: 57.1, sd: 2.1, unit: 'cm' },
        { weeks: 12, p50: 60.0, sd: 2.2, unit: 'cm' },
        { weeks: 16, p50: 62.4, sd: 2.3, unit: 'cm' },
        { weeks: 20, p50: 64.3, sd: 2.4, unit: 'cm' },
        { weeks: 24, p50: 66.0, sd: 2.5, unit: 'cm' },
        { weeks: 36, p50: 71.0, sd: 2.7, unit: 'cm' },
        { weeks: 52, p50: 75.7, sd: 2.9, unit: 'cm' },
        { weeks: 78, p50: 83.0, sd: 3.1, unit: 'cm' },
        { weeks: 104, p50: 87.8, sd: 3.3, unit: 'cm' }
    ],
    hc: [
        { weeks: 0, p50: 34.5, sd: 1.3, unit: 'cm' },
        { weeks: 4, p50: 37.1, sd: 1.4, unit: 'cm' },
        { weeks: 8, p50: 39.0, sd: 1.5, unit: 'cm' },
        { weeks: 12, p50: 40.5, sd: 1.5, unit: 'cm' },
        { weeks: 16, p50: 41.8, sd: 1.6, unit: 'cm' },
        { weeks: 20, p50: 42.8, sd: 1.6, unit: 'cm' },
        { weeks: 24, p50: 43.6, sd: 1.7, unit: 'cm' },
        { weeks: 36, p50: 45.8, sd: 1.8, unit: 'cm' },
        { weeks: 52, p50: 46.9, sd: 1.9, unit: 'cm' },
        { weeks: 78, p50: 48.5, sd: 2.0, unit: 'cm' },
        { weeks: 104, p50: 49.5, sd: 2.1, unit: 'cm' }
    ]
};

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonitoringProfile(userId, babyId) {
    return BabyMonitoring.findOne({ userId, babyId });
}

function validateVitalPayload(payload) {
    const fields = ['heartRate', 'oxygenSaturation', 'temperature', 'respiratoryRate'];
    const hasAnyVital = fields.some((field) => isFiniteNumber(payload?.[field]?.value));

    if (!hasAnyVital) {
        return 'At least one vital sign is required';
    }
    return null;
}

function validateGrowthPayload(payload) {
    const hasWeight = isFiniteNumber(payload?.weight?.value);
    const hasLength = isFiniteNumber(payload?.length?.value);
    const hasHead = isFiniteNumber(payload?.headCircumference?.value);
    if (!hasWeight && !hasLength && !hasHead) {
        return 'At least one growth measurement is required';
    }

    const adjustedAge = payload?.adjustedAge || {};
    const weeks = Number(adjustedAge.weeks || 0);
    const days = Number(adjustedAge.days || 0);
    if (!Number.isFinite(weeks) || !Number.isFinite(days) || weeks < 0 || days < 0 || days > 6) {
        return 'adjustedAge must include valid weeks and days';
    }

    return null;
}

function validateFeedingPayload(payload) {
    const allowedTypes = ['breast', 'bottle', 'tube', 'mixed', 'solids'];
    if (!allowedTypes.includes(payload?.type)) {
        return 'Invalid feeding type';
    }

    const timestamp = toDate(payload?.timestamp);
    if (!timestamp) {
        return 'Valid feeding timestamp is required';
    }

    if (payload.type === 'breast' && !isFiniteNumber(payload?.duration)) {
        return 'Breastfeeding entries require duration in minutes';
    }

    if (payload.type !== 'breast' && !isFiniteNumber(payload?.amount?.value)) {
        return 'Bottle/tube/mixed/solids entries require amount.value';
    }

    return null;
}

function validateDiaperPayload(payload) {
    const allowedTypes = ['wet', 'dirty', 'both'];
    if (!allowedTypes.includes(payload?.type)) {
        return 'Invalid diaper type';
    }
    if (!toDate(payload?.timestamp)) {
        return 'Valid diaper timestamp is required';
    }
    return null;
}

function validateMedicationPayload(payload) {
    if (!payload?.name || typeof payload.name !== 'string' || payload.name.trim().length < 2) {
        return 'Medication name is required';
    }
    return null;
}

// Create or get monitoring profile for a baby
router.post('/profile/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;

        // Check if monitoring profile exists
        let monitoring = await BabyMonitoring.findOne({ userId, babyId });
        
        if (!monitoring) {
            // Get baby info from user profile
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            const baby = user.getBabyProfile(babyId);
            
            if (!baby) {
                return res.status(404).json({ error: 'Baby profile not found' });
            }

            // Create new monitoring profile
            monitoring = new BabyMonitoring({
                userId,
                babyId,
                riskFactors: req.body.riskFactors || {},
                alertThresholds: req.body.alertThresholds || DEFAULT_ALERT_THRESHOLDS
            });
            
            await monitoring.save();
        }
        
        res.json(monitoring);
    } catch (error) {
        console.error('Error creating monitoring profile:', error);
        res.status(500).json({ error: 'Failed to create monitoring profile' });
    }
});

// Add vital signs
router.post('/vitals/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const validationError = validateVitalPayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        monitoring.vitalSigns.push(req.body);
        
        // Check for alerts
        const alerts = monitoring.checkAlertThresholds(req.body);
        if (alerts.length > 0) {
            monitoring.alerts.push(...alerts);
        }
        
        await monitoring.save();
        
        res.json({ 
            success: true, 
            vitals: monitoring.vitalSigns[monitoring.vitalSigns.length - 1],
            alerts 
        });
    } catch (error) {
        console.error('Error adding vital signs:', error);
        res.status(500).json({ error: 'Failed to add vital signs' });
    }
});

// Add growth measurement
router.post('/growth/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const validationError = validateGrowthPayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        // Calculate percentiles (simplified - would integrate with WHO/CDC charts)
        const measurement = {
            ...req.body,
            weight: {
                ...req.body.weight,
                percentile: calculatePercentile(req.body.weight.value, req.body.adjustedAge, 'weight')
            },
            length: {
                ...req.body.length,
                percentile: calculatePercentile(req.body.length.value, req.body.adjustedAge, 'length')
            },
            headCircumference: {
                ...req.body.headCircumference,
                percentile: calculatePercentile(req.body.headCircumference.value, req.body.adjustedAge, 'hc')
            }
        };
        
        monitoring.growthMeasurements.push(measurement);
        
        // Check weight gain velocity
        const velocity = monitoring.getWeightGainVelocity();
        if (velocity !== null && monitoring.alertThresholds.weightGainDaily) {
            if (velocity < monitoring.alertThresholds.weightGainDaily.min) {
                monitoring.alerts.push({
                    type: 'growth',
                    severity: 'medium',
                    message: `Low weight gain: ${velocity.toFixed(1)}g/day (expected: >${monitoring.alertThresholds.weightGainDaily.min}g/day)`
                });
            }
        }
        
        await monitoring.save();
        
        res.json({ 
            success: true, 
            measurement: monitoring.growthMeasurements[monitoring.growthMeasurements.length - 1],
            weightGainVelocity: velocity
        });
    } catch (error) {
        console.error('Error adding growth measurement:', error);
        res.status(500).json({ error: 'Failed to add growth measurement' });
    }
});

// Add feeding record
router.post('/feeding/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const validationError = validateFeedingPayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        monitoring.feedingRecords.push(req.body);
        
        // Check feeding intervals
        if (monitoring.feedingRecords.length > 1) {
            const lastFeeding = monitoring.feedingRecords[monitoring.feedingRecords.length - 2];
            const interval = (new Date(req.body.timestamp) - lastFeeding.timestamp) / (1000 * 60 * 60);
            
            if (interval > monitoring.alertThresholds.feedingInterval.max) {
                monitoring.alerts.push({
                    type: 'feeding',
                    severity: 'medium',
                    message: `Long feeding interval: ${interval.toFixed(1)} hours`
                });
            }
        }
        
        await monitoring.save();
        
        const todaysTotal = monitoring.getTodaysFeedingTotal();
        
        res.json({ 
            success: true, 
            feeding: monitoring.feedingRecords[monitoring.feedingRecords.length - 1],
            todaysTotal 
        });
    } catch (error) {
        console.error('Error adding feeding record:', error);
        res.status(500).json({ error: 'Failed to add feeding record' });
    }
});

// Add diaper record
router.post('/diaper/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const validationError = validateDiaperPayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        monitoring.diaperRecords.push(req.body);
        
        // Check wet diaper count for the day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysWetDiapers = monitoring.diaperRecords
            .filter(record => 
                record.timestamp >= today && 
                (record.type === 'wet' || record.type === 'both')
            ).length;
        
        await monitoring.save();
        
        res.json({ 
            success: true, 
            diaper: monitoring.diaperRecords[monitoring.diaperRecords.length - 1],
            todaysWetCount: todaysWetDiapers
        });
    } catch (error) {
        console.error('Error adding diaper record:', error);
        res.status(500).json({ error: 'Failed to add diaper record' });
    }
});

// Add medication
router.post('/medication/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const validationError = validateMedicationPayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        monitoring.medications.push(req.body);
        await monitoring.save();
        
        res.json({ 
            success: true, 
            medication: monitoring.medications[monitoring.medications.length - 1]
        });
    } catch (error) {
        console.error('Error adding medication:', error);
        res.status(500).json({ error: 'Failed to add medication' });
    }
});

// Log medication administration
router.post('/medication/:babyId/:medicationId/log', verifyToken, async (req, res) => {
    try {
        const { babyId, medicationId } = req.params;
        const userId = req.userId;
        if (!toDate(req.body?.timestamp)) {
            return res.status(400).json({ error: 'Valid administration timestamp is required' });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        const medication = monitoring.medications.id(medicationId);
        if (!medication) {
            return res.status(404).json({ error: 'Medication not found' });
        }
        
        medication.administrationLog.push(req.body);
        await monitoring.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error logging medication:', error);
        res.status(500).json({ error: 'Failed to log medication' });
    }
});

// Get dashboard data
router.get('/dashboard/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        // Get user and baby info
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const baby = user.getBabyProfile(babyId);
        
        // Get latest data
        const latestVitals = monitoring.getLatestVitals();
        const latestGrowth = monitoring.getLatestGrowth();
        const todaysFeedingTotal = monitoring.getTodaysFeedingTotal();
        const weightGainVelocity = monitoring.getWeightGainVelocity();
        
        // Get unacknowledged alerts
        const activeAlerts = monitoring.alerts.filter(alert => !alert.acknowledged);
        
        // Get today's records
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysFeedings = monitoring.feedingRecords.filter(r => r.timestamp >= today);
        const todaysDiapers = monitoring.diaperRecords.filter(r => r.timestamp >= today);
        
        // Get medications due today
        const medicationsDue = monitoring.medications.filter(med => {
            if (!med.endDate || med.endDate >= today) {
                return med.reminders.some(reminder => reminder.enabled);
            }
            return false;
        });
        
        res.json({
            baby,
            monitoring: {
                riskFactors: monitoring.riskFactors,
                latestVitals,
                latestGrowth,
                todaysFeedingTotal,
                weightGainVelocity,
                activeAlerts,
                todaysFeedings,
                todaysDiapers,
                medicationsDue,
                recentVitals: monitoring.vitalSigns.slice(-10),
                recentGrowth: monitoring.growthMeasurements.slice(-10),
                recentNotes: monitoring.dailyNotes.slice(-10)
            }
        });
    } catch (error) {
        console.error('Error getting dashboard data:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});

// Acknowledge alert
router.post('/alert/:babyId/:alertId/acknowledge', verifyToken, async (req, res) => {
    try {
        const { babyId, alertId } = req.params;
        const userId = req.userId;
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        const alert = monitoring.alerts.id(alertId);
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }
        
        alert.acknowledged = true;
        alert.acknowledgedBy = req.body.acknowledgedBy || 'User';
        alert.acknowledgedAt = new Date();
        alert.actionTaken = req.body.actionTaken;
        
        await monitoring.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

// Save daily care notes
router.post('/notes/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const userId = req.userId;
        const noteText = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
        const noteDate = req.body?.date ? toDate(req.body.date) : new Date();
        const mood = req.body?.mood || 'content';
        const allowedMoods = ['happy', 'content', 'fussy', 'irritable'];

        if (!noteText) {
            return res.status(400).json({ error: 'notes is required' });
        }
        if (!noteDate) {
            return res.status(400).json({ error: 'date must be a valid datetime' });
        }
        if (!allowedMoods.includes(mood)) {
            return res.status(400).json({ error: 'mood must be one of happy, content, fussy, irritable' });
        }

        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }

        monitoring.dailyNotes.push({
            date: noteDate,
            mood,
            notes: noteText
        });
        await monitoring.save();

        res.json({
            success: true,
            note: monitoring.dailyNotes[monitoring.dailyNotes.length - 1]
        });
    } catch (error) {
        console.error('Error saving daily note:', error);
        res.status(500).json({ error: 'Failed to save daily note' });
    }
});

// Export data
router.get('/export/:babyId', verifyToken, async (req, res) => {
    try {
        const { babyId } = req.params;
        const { format = 'json', startDate, endDate } = req.query;
        const userId = req.userId;
        if (!['json', 'csv'].includes(format)) {
            return res.status(400).json({ error: 'format must be json or csv' });
        }
        
        const monitoring = await getMonitoringProfile(userId, babyId);
        if (!monitoring) {
            return res.status(404).json({ error: 'Monitoring profile not found' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const baby = user.getBabyProfile(babyId);
        
        let data = {
            baby,
            riskFactors: monitoring.riskFactors,
            vitalSigns: monitoring.vitalSigns,
            growthMeasurements: monitoring.growthMeasurements,
            feedingRecords: monitoring.feedingRecords,
            diaperRecords: monitoring.diaperRecords,
            medications: monitoring.medications,
            alerts: monitoring.alerts,
            milestones: monitoring.milestones
        };
        
        // Filter by date range if provided
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
                return res.status(400).json({ error: 'Invalid date range' });
            }
            
            data.vitalSigns = data.vitalSigns.filter(v => v.timestamp >= start && v.timestamp <= end);
            data.growthMeasurements = data.growthMeasurements.filter(g => g.date >= start && g.date <= end);
            data.feedingRecords = data.feedingRecords.filter(f => f.timestamp >= start && f.timestamp <= end);
            data.diaperRecords = data.diaperRecords.filter(d => d.timestamp >= start && d.timestamp <= end);
            data.alerts = data.alerts.filter(a => a.timestamp >= start && a.timestamp <= end);
        }
        
        if (format === 'csv') {
            // Convert to CSV format (simplified)
            const csv = convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="baby-monitoring-${babyId}.csv"`);
            res.send(csv);
        } else {
            res.json(data);
        }
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Helper function to calculate percentiles (simplified placeholder)
function calculatePercentile(value, adjustedAge, type) {
    if (!isFiniteNumber(value)) {
        return null;
    }

    const chart = GROWTH_CHARTS[type];
    if (!chart || chart.length === 0) {
        return null;
    }

    // adjustedAge is expected to be { weeks, days } for corrected age.
    const weeks = Number(adjustedAge?.weeks || 0);
    const days = Number(adjustedAge?.days || 0);
    const ageInWeeks = Math.max(0, (Number.isFinite(weeks) ? weeks : 0) + ((Number.isFinite(days) ? days : 0) / 7));

    const [lower, upper] = findBoundingPoints(chart, ageInWeeks);
    const p50 = interpolate(lower.weeks, upper.weeks, lower.p50, upper.p50, ageInWeeks);
    const sd = interpolate(lower.weeks, upper.weeks, lower.sd, upper.sd, ageInWeeks);
    const normalized = normalizeToChartUnit(value, type);
    if (normalized === null || sd <= 0) {
        return null;
    }

    const zScore = (normalized - p50) / sd;
    const percentile = Math.round(normalCdf(zScore) * 100);
    return Math.max(1, Math.min(99, percentile));
}

function findBoundingPoints(chart, ageInWeeks) {
    if (ageInWeeks <= chart[0].weeks) {
        return [chart[0], chart[0]];
    }
    if (ageInWeeks >= chart[chart.length - 1].weeks) {
        const last = chart[chart.length - 1];
        return [last, last];
    }

    for (let i = 0; i < chart.length - 1; i++) {
        const current = chart[i];
        const next = chart[i + 1];
        if (ageInWeeks >= current.weeks && ageInWeeks <= next.weeks) {
            return [current, next];
        }
    }

    const fallback = chart[chart.length - 1];
    return [fallback, fallback];
}

function interpolate(x1, x2, y1, y2, x) {
    if (x1 === x2) {
        return y1;
    }
    const ratio = (x - x1) / (x2 - x1);
    return y1 + (y2 - y1) * ratio;
}

function normalizeToChartUnit(value, type) {
    if (!isFiniteNumber(value)) {
        return null;
    }

    // Growth payload currently passes normalized units:
    // - weight in kg, length/head circumference in cm
    // If this changes in the future, unit conversion should happen before this call.
    if (type === 'weight' && value > 40) {
        return value / 1000;
    }
    return value;
}

function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * absX);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;

    const poly = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t;
    return sign * (1 - poly * Math.exp(-absX * absX));
}

// Helper function to convert data to CSV
function convertToCSV(data) {
    let csv = 'Category,Date,Type,Value,Unit,Notes\n';
    
    // Add vital signs
    data.vitalSigns.forEach(v => {
        if (v.heartRate) csv += `Vitals,${v.timestamp},Heart Rate,${v.heartRate.value},${v.heartRate.unit},"${v.notes || ''}"\n`;
        if (v.oxygenSaturation) csv += `Vitals,${v.timestamp},O2 Sat,${v.oxygenSaturation.value},${v.oxygenSaturation.unit},"${v.notes || ''}"\n`;
        if (v.temperature) csv += `Vitals,${v.timestamp},Temperature,${v.temperature.value},${v.temperature.unit},"${v.notes || ''}"\n`;
    });
    
    // Add growth measurements
    data.growthMeasurements.forEach(g => {
        if (g.weight) csv += `Growth,${g.date},Weight,${g.weight.value},${g.weight.unit},"${g.notes || ''}"\n`;
        if (g.length) csv += `Growth,${g.date},Length,${g.length.value},${g.length.unit},"${g.notes || ''}"\n`;
        if (g.headCircumference) csv += `Growth,${g.date},Head Circumference,${g.headCircumference.value},${g.headCircumference.unit},"${g.notes || ''}"\n`;
    });
    
    // Add feeding records
    data.feedingRecords.forEach(f => {
        csv += `Feeding,${f.timestamp},${f.type},${f.amount?.value || f.duration},${f.amount?.unit || 'minutes'},"${f.notes || ''}"\n`;
    });
    
    return csv;
}

module.exports = router;
module.exports.__testUtils = {
    calculatePercentile,
    validateVitalPayload,
    validateGrowthPayload,
    validateFeedingPayload,
    validateDiaperPayload,
    validateMedicationPayload
};