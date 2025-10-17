const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const headerToken = req.header('Authorization')?.replace('Bearer ', '');
        const sessionToken = req.session?.token;
        const queryToken = req.query?.token;
        const bodyToken = req.body?.token;
        const token = headerToken || sessionToken || queryToken || bodyToken;

        if (!token) {
            return res.status(401).json({ error: 'Please authenticate' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            throw new Error();
        }
        
        // Check if this session is still valid
        const session = user.findSessionByToken(token);
        if (!session) {
            return res.status(401).json({ 
                error: 'Session expired or invalid. Please log in again.' 
            });
        }
        
        // Update session activity
        await user.updateSessionActivity(token);

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

// Check if user has premium subscription
const requirePremium = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Please authenticate' });
        }

        if (!req.user.isPremium) {
            // Check if user has free searches remaining
            const hasFreebies = await req.user.checkDailyLimit();
            
            if (!hasFreebies) {
                return res.status(403).json({ 
                    error: 'Daily limit reached',
                    message: 'You have used all 3 free searches today. Upgrade to premium for unlimited searches!',
                    requiresPayment: true
                });
            }
        }

        next();
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = { verifyToken, requirePremium };