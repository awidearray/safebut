const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const router = express.Router();

// Email transporter setup (configure based on your email provider)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// In-memory storage for magic link tokens (in production, use Redis or database)
const magicLinkTokens = new Map();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Request magic link
router.post('/request-magic-link', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }
        
        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        
        // Store token with email and expiration
        magicLinkTokens.set(token, {
            email,
            expires,
            used: false
        });
        
        // Create magic link
        const magicLink = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/verify-magic-link?token=${token}`;
        
        // Send email (if SMTP is configured)
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            try {
                const mailOptions = {
                    from: process.env.SMTP_USER,
                    to: email,
                    subject: '🤰 Your Safebut Login Link',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
                                <h1 style="color: white; margin: 0; text-align: center;">🤰 Safebut</h1>
                                <p style="color: white; margin: 5px 0 0; text-align: center;">Pregnancy Safety Checker</p>
                            </div>
                            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                                <h2 style="color: #333; margin-top: 0;">Your login link is ready!</h2>
                                <p style="color: #666; line-height: 1.6;">
                                    Click the button below to securely log in to your Safebut account. 
                                    This link will expire in 15 minutes for your security.
                                </p>
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${magicLink}" style="
                                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                        color: white;
                                        padding: 15px 30px;
                                        text-decoration: none;
                                        border-radius: 8px;
                                        font-weight: bold;
                                        display: inline-block;
                                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                                    ">🚀 Log In to Safebut</a>
                                </div>
                                <p style="color: #999; font-size: 14px; line-height: 1.5;">
                                    If you didn't request this login link, you can safely ignore this email. 
                                    Your account remains secure.
                                </p>
                                <hr style="border: 1px solid #eee; margin: 20px 0;">
                                <p style="color: #999; font-size: 12px; text-align: center;">
                                    This link expires in 15 minutes for your security.<br>
                                    If the button doesn't work, copy and paste this link: ${magicLink}
                                </p>
                            </div>
                        </div>
                    `
                };
                
                await transporter.sendMail(mailOptions);
                console.log('Magic link sent to:', email);
            } catch (emailError) {
                console.error('Failed to send email:', emailError);
                // Don't fail the request if email fails - for development
            }
        } else {
            // In development, log the magic link
            console.log('Magic link for', email, ':', magicLink);
        }
        
        return res.json({
            success: true,
            message: 'Magic link sent to your email. Check your inbox!',
            // In development, return the link
            ...(process.env.NODE_ENV === 'development' && { magicLink })
        });
        
    } catch (error) {
        console.error('Magic link request error:', error);
        res.status(500).json({ success: false, error: 'Failed to send magic link' });
    }
});

// Verify magic link
router.get('/verify-magic-link', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.redirect('/login?error=invalid_token');
        }
        
        // Check if token exists and is valid
        const tokenData = magicLinkTokens.get(token);
        
        if (!tokenData) {
            return res.redirect('/login?error=invalid_token');
        }
        
        if (tokenData.used) {
            return res.redirect('/login?error=token_used');
        }
        
        if (new Date() > tokenData.expires) {
            magicLinkTokens.delete(token);
            return res.redirect('/login?error=token_expired');
        }
        
        // Mark token as used
        tokenData.used = true;
        
        // Find or create user by email
        let user = await User.findOne({ email: tokenData.email });
        
        if (!user) {
            // Create new user with email
            user = new User({
                email: tokenData.email,
                name: tokenData.email.split('@')[0], // Use email prefix as name
                provider: 'email'
            });
            await user.save();
        }
        
        // Generate JWT token
        const jwtToken = generateToken(user._id);
        
        // Update session
        req.session.token = jwtToken;
        req.session.userId = user._id;
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Clean up the magic link token
        magicLinkTokens.delete(token);
        
        // Redirect to app with token
        return res.redirect(`/app.html?token=${jwtToken}&premium=${user.isPremium}`);
        
    } catch (error) {
        console.error('Magic link verification error:', error);
        res.redirect('/login?error=auth_failed');
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