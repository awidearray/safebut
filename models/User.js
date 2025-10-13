const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption helper functions
const algorithm = 'aes-256-gcm';
const getKey = () => crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-this', 'salt', 32);

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('hex'), authTag: authTag.toString('hex'), encrypted });
}

function decrypt(encryptedData) {
    if (!encryptedData) return null;
    try {
        const { iv, authTag, encrypted } = JSON.parse(encryptedData);
        const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

const userSchema = new mongoose.Schema({
    // TON Wallet info
    tonWalletAddress: { type: String, unique: true, sparse: true },
    tonPublicKey: String,
    tonChain: String,
    
    // User profile
    name: { type: String, required: true },
    username: String,
    email: { type: String, unique: true, sparse: true },
    profilePicture: String,
    provider: { type: String, enum: ['email', 'ton'], required: true },
    
    // Encrypted health profile
    encryptedProfile: String,
    
    // Subscription info
    isPremium: { type: Boolean, default: false },
    stripeCustomerId: String,
    stripePaymentIntentId: String,
    stripeSessionId: String,
    stripeSubscriptionId: String,
    subscriptionType: String, // 'monthly', 'annual', 'lifetime'
    subscriptionDate: Date,
    subscriptionEndDate: Date,
    
    // Search history
    searchHistory: [{
        item: String,
        riskScore: Number,
        timestamp: { type: Date, default: Date.now },
        isImage: { type: Boolean, default: false }
    }],
    
    // Pregnancy log entries (Premium feature)
    logEntries: [{
        id: String,
        date: { type: Date, default: Date.now },
        text: String,
        type: { type: String, enum: ['text', 'voice'], default: 'text' },
        audioUrl: String,
        aiAnalysis: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    // Usage tracking for free tier (3 searches per day)
    dailySearches: {
        count: { type: Number, default: 0 },
        date: { type: Date, default: Date.now }
    },
    
    // Affiliate system
    affiliateCode: { type: String, unique: true, sparse: true },
    affiliatePoints: { type: Number, default: 0 },
    referredBy: { type: String }, // affiliate code of referrer
    referrals: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        email: String,
        signupDate: { type: Date, default: Date.now },
        pointsAwarded: { type: Number, default: 0 },
        isPremium: { type: Boolean, default: false }
    }],
    
    // Account timestamps
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now }
});

// Reset daily search count if it's a new day
userSchema.methods.checkDailyLimit = function() {
    const today = new Date().setHours(0, 0, 0, 0);
    const lastSearchDate = new Date(this.dailySearches.date).setHours(0, 0, 0, 0);
    
    if (today !== lastSearchDate) {
        this.dailySearches.count = 0;
        this.dailySearches.date = new Date();
    }
    
    // Premium users have unlimited searches
    if (this.isPremium) return true;
    
    // Free users get 1 search per day
    return this.dailySearches.count < 1;
};

// Increment search count
userSchema.methods.incrementSearchCount = function() {
    this.checkDailyLimit();
    this.dailySearches.count++;
    return this.save();
};

// Add to search history
userSchema.methods.addToHistory = function(item, riskScore, isImage = false) {
    this.searchHistory.unshift({
        item,
        riskScore,
        isImage,
        timestamp: new Date()
    });
    
    // Keep only last 100 searches
    if (this.searchHistory.length > 100) {
        this.searchHistory = this.searchHistory.slice(0, 100);
    }
    
    return this.save();
};

// Save encrypted profile
userSchema.methods.saveProfile = function(profileData) {
    this.encryptedProfile = encrypt(profileData);
    return this.save();
};

// Get decrypted profile
userSchema.methods.getProfile = function() {
    return decrypt(this.encryptedProfile) || {};
};

// Generate unique affiliate code
userSchema.methods.generateAffiliateCode = function() {
    if (this.affiliateCode) return this.affiliateCode;
    
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    this.affiliateCode = `SB${code}`;
    return this.affiliateCode;
};

// Award points for referral
userSchema.methods.awardReferralPoints = function(pointsToAward) {
    this.affiliatePoints += pointsToAward;
    return this.save();
};

// Add referral
userSchema.methods.addReferral = function(referredUser, pointsAwarded = 10) {
    this.referrals.push({
        userId: referredUser._id,
        email: referredUser.email,
        signupDate: new Date(),
        pointsAwarded: pointsAwarded,
        isPremium: referredUser.isPremium
    });
    
    // Award points to referrer
    this.affiliatePoints += pointsAwarded;
    return this.save();
};

module.exports = mongoose.model('User', userSchema);