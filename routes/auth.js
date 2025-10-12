const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Facebook login
router.get('/facebook', passport.authenticate('facebook', { 
    scope: ['email', 'public_profile'] 
}));

router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/app?error=auth_failed' }),
    async (req, res) => {
        const token = generateToken(req.user._id);
        req.session.token = token;
        req.session.userId = req.user._id;
        
        // Update last login
        req.user.lastLogin = new Date();
        await req.user.save();
        
        res.redirect(`/app?token=${token}&premium=${req.user.isPremium}`);
    }
);

// Instagram login
router.get('/instagram', passport.authenticate('instagram'));

router.get('/instagram/callback',
    passport.authenticate('instagram', { failureRedirect: '/app?error=auth_failed' }),
    async (req, res) => {
        const token = generateToken(req.user._id);
        req.session.token = token;
        req.session.userId = req.user._id;
        
        // Update last login
        req.user.lastLogin = new Date();
        await req.user.save();
        
        res.redirect(`/app?token=${token}&premium=${req.user.isPremium}`);
    }
);

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
                dailySearchesRemaining: user.isPremium ? 'unlimited' : (3 - user.dailySearches.count),
                canSearch: user.isPremium || hasFreebies
            }
        });
    } catch (error) {
        res.status(401).json({ authenticated: false });
    }
});

module.exports = router;