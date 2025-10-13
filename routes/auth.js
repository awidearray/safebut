const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Simple email login (no password, just email)
router.post('/email-login', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }
        
        // Find or create user by email
        let user = await User.findOne({ email });
        
        if (!user) {
            // Create new user with email
            user = new User({
                email,
                name: email.split('@')[0], // Use email prefix as name
                provider: 'email'
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
                email: user.email,
                name: user.name,
                isPremium: user.isPremium
            }
        });
        
    } catch (error) {
        console.error('Email login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

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

// Telegram OAuth callback
router.get('/telegram/callback', async (req, res) => {
    try {
        const authData = req.query;
        
        // Verify the authentication data from Telegram
        if (!verifyTelegramAuth(authData)) {
            return res.redirect('/login?error=auth_failed');
        }
        
        // Check if auth_date is not too old (5 minutes)
        const authDate = parseInt(authData.auth_date);
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - authDate > 300) {
            return res.redirect('/login?error=auth_expired');
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
        
        // Redirect to app with token
        return res.redirect(`/app?token=${token}&premium=${user.isPremium}`);
        
    } catch (error) {
        console.error('Telegram OAuth callback error:', error);
        res.redirect('/login?error=auth_failed');
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