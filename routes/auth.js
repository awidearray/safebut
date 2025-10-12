const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Verify Telegram auth data
function verifyTelegramAuth(authData) {
    const secret = crypto.createHash('sha256')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();
    
    const checkString = Object.keys(authData)
        .filter(key => key !== 'hash')
        .sort()
        .map(key => `${key}=${authData[key]}`)
        .join('\n');
    
    const hash = crypto.createHmac('sha256', secret)
        .update(checkString)
        .digest('hex');
    
    return hash === authData.hash;
}

// Telegram login
router.post('/telegram', async (req, res) => {
    try {
        const authData = req.body;
        
        // Verify the authentication data from Telegram
        if (!verifyTelegramAuth(authData)) {
            return res.status(401).json({ success: false, error: 'Invalid authentication data' });
        }
        
        // Check if auth_date is not too old (5 minutes)
        const authDate = parseInt(authData.auth_date);
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - authDate > 300) {
            return res.status(401).json({ success: false, error: 'Authentication data expired' });
        }
        
        // Find or create user
        let user = await User.findOne({ telegramId: authData.id });
        
        if (!user) {
            user = new User({
                telegramId: authData.id,
                name: `${authData.first_name} ${authData.last_name || ''}`.trim(),
                username: authData.username,
                profilePicture: authData.photo_url,
                provider: 'telegram'
            });
            await user.save();
        }
        
        // Generate JWT token
        const token = generateToken(user._id);
        
        // Update session
        req.session.token = token;
        req.session.userId = user._id;
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        return res.json({
            success: true,
            token: token,
            isPremium: user.isPremium,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                profilePicture: user.profilePicture,
                isPremium: user.isPremium
            }
        });
        
    } catch (error) {
        console.error('Telegram login error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        req.session.destroy();
        res.json({ success: true });
    });
});


// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.session?.token;

        if (!token) {
            return res.status(401).json({ authenticated: false });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-searchHistory');

        if (!user) {
            return res.status(401).json({ authenticated: false });
        }

        // Check daily limit for free users
        const hasFreebies = await user.checkDailyLimit();
        
        res.json({
            authenticated: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePicture: user.profilePicture,
                isPremium: user.isPremium,
                provider: user.provider,
                dailySearchesRemaining: user.isPremium ? 'unlimited' : (1 - user.dailySearches.count),
                canSearch: user.isPremium || hasFreebies
            }
        });
    } catch (error) {
        res.status(401).json({ authenticated: false });
    }
});

module.exports = router;