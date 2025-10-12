const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Social login info
    telegramId: { type: String, unique: true, sparse: true },
    
    // User profile
    name: { type: String, required: true },
    username: String,
    email: { type: String, unique: true, sparse: true },
    profilePicture: String,
    provider: { type: String, enum: ['telegram'], required: true },
    
    // Subscription info
    isPremium: { type: Boolean, default: false },
    stripeCustomerId: String,
    stripePaymentIntentId: String,
    subscriptionDate: Date,
    
    // Search history
    searchHistory: [{
        item: String,
        riskScore: Number,
        timestamp: { type: Date, default: Date.now },
        isImage: { type: Boolean, default: false }
    }],
    
    // Usage tracking for free tier (3 searches per day)
    dailySearches: {
        count: { type: Number, default: 0 },
        date: { type: Date, default: Date.now }
    },
    
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

module.exports = mongoose.model('User', userSchema);