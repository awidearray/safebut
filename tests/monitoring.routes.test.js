const test = require('node:test');
const assert = require('node:assert/strict');

const monitoringRoute = require('../routes/monitoring');
const { __testUtils } = monitoringRoute;

test('calculatePercentile is deterministic for same input', () => {
    const p1 = __testUtils.calculatePercentile(6.5, { weeks: 20, days: 0 }, 'weight');
    const p2 = __testUtils.calculatePercentile(6.5, { weeks: 20, days: 0 }, 'weight');
    assert.equal(p1, p2);
    assert.ok(p1 >= 1 && p1 <= 99);
});

test('calculatePercentile increases with larger measurement at same age', () => {
    const lower = __testUtils.calculatePercentile(5.5, { weeks: 20, days: 0 }, 'weight');
    const higher = __testUtils.calculatePercentile(7.0, { weeks: 20, days: 0 }, 'weight');
    assert.ok(higher > lower);
});

test('validateVitalPayload rejects empty payloads', () => {
    const result = __testUtils.validateVitalPayload({});
    assert.equal(result, 'At least one vital sign is required');
});

test('validateVitalPayload accepts payload with one vital', () => {
    const result = __testUtils.validateVitalPayload({
        heartRate: { value: 128 }
    });
    assert.equal(result, null);
});

test('validateGrowthPayload enforces adjusted age shape', () => {
    const result = __testUtils.validateGrowthPayload({
        weight: { value: 6.2 },
        adjustedAge: { weeks: 20, days: 9 }
    });
    assert.equal(result, 'adjustedAge must include valid weeks and days');
});

test('validateGrowthPayload accepts valid measurements and age', () => {
    const result = __testUtils.validateGrowthPayload({
        weight: { value: 6.2 },
        adjustedAge: { weeks: 20, days: 3 }
    });
    assert.equal(result, null);
});

test('validateFeedingPayload enforces type-specific requirements', () => {
    const breast = __testUtils.validateFeedingPayload({
        type: 'breast',
        timestamp: new Date().toISOString()
    });
    assert.equal(breast, 'Breastfeeding entries require duration in minutes');

    const bottle = __testUtils.validateFeedingPayload({
        type: 'bottle',
        timestamp: new Date().toISOString()
    });
    assert.equal(bottle, 'Bottle/tube/mixed/solids entries require amount.value');
});

test('validateDiaperPayload and validateMedicationPayload reject invalid data', () => {
    assert.equal(
        __testUtils.validateDiaperPayload({ type: 'wet', timestamp: 'not-a-date' }),
        'Valid diaper timestamp is required'
    );
    assert.equal(
        __testUtils.validateMedicationPayload({ name: '' }),
        'Medication name is required'
    );
});
