const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const router = express.Router();

// Email transporter setup for Brevo (formerly Sendinblue)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: true
    }
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
        const { email, referralCode } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }
        
        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        
        // Store token with email, referral code, and expiration
        magicLinkTokens.set(token, {
            email,
            referralCode: referralCode || null,
            expires,
            used: false
        });
        
        // Create magic link with correct base URL (production-safe)
        // Always use https://safe-maternity.com for production magic links
        const baseUrl = process.env.BASE_URL || 'https://safe-maternity.com';
        const magicLink = `${baseUrl}/auth/verify-magic-link?token=${token}`;
        
        // Send email via Brevo
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            try {
                console.log('Attempting to send magic link email via Brevo to:', email);
                console.log('SMTP Config:', {
                    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
                    port: process.env.SMTP_PORT || 587,
                    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@safe-maternity.com',
                    user: process.env.SMTP_USER ? 'Configured' : 'Missing',
                    pass: process.env.SMTP_PASS ? 'Configured' : 'Missing'
                });
                
                const mailOptions = {
                    from: `"Safe Maternity" <${process.env.SMTP_FROM || 'noreply@safe-maternity.com'}>`,
                    to: email,
                    subject: '🤰 Your Safe Maternity Login Link',
                    html: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Safe Maternity Login Link</title>
                        </head>
                        <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <!-- Header with Safe Maternity branding -->
                                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                                    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
                                        🤰 Safe Maternity
                                    </h1>
                                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
                                        Your Trusted Pregnancy Safety Companion
                                    </p>
                                </div>
                                
                                <!-- Main Content -->
                                <div style="padding: 40px 30px;">
                                    <h2 style="color: #333; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">
                                        Welcome to Safe Maternity! 👋
                                    </h2>
                                    
                                    <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                        Click the button below to securely access your Safe Maternity account. 
                                        This magic link will expire in <strong>15 minutes</strong> for your security.
                                    </p>
                                    
                                    <!-- CTA Button -->
                                    <div style="text-align: center; margin: 35px 0;">
                                        <a href="${magicLink}" style="
                                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                            color: white;
                                            padding: 16px 40px;
                                            text-decoration: none;
                                            border-radius: 50px;
                                            font-weight: 600;
                                            font-size: 16px;
                                            display: inline-block;
                                            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                                            transition: all 0.3s ease;
                                        ">
                                            ✨ Access Safe Maternity Now
                                        </a>
                                    </div>
                                    
                                    <!-- Security Notice -->
                                    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                                        <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0;">
                                            <strong style="color: #333;">🔒 Security Notice:</strong><br>
                                            If you didn't request this login link, you can safely ignore this email. 
                                            Your Safe Maternity account remains secure.
                                        </p>
                                    </div>
                                    
                                    <!-- Alternative Link -->
                                    <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
                                        <p style="color: #888; font-size: 13px; text-align: center; line-height: 1.5;">
                                            Having trouble with the button? Copy and paste this link into your browser:<br>
                                            <a href="${magicLink}" style="color: #667eea; word-break: break-all;">
                                                ${magicLink}
                                            </a>
                                        </p>
                                    </div>
                                </div>
                                
                                <!-- Footer -->
                                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                                    <p style="color: #888; font-size: 12px; margin: 0;">
                                        © 2024 Safe Maternity - Your pregnancy safety companion<br>
                                        <a href="https://safe-maternity.com" style="color: #667eea; text-decoration: none;">
                                            www.safe-maternity.com
                                        </a>
                                    </p>
                                </div>
                            </div>
                        </body>
                        </html>
                    `,
                    text: `
Safe Maternity - Login Link

Welcome to Safe Maternity!

Click this link to log in to your account:
${magicLink}

This link will expire in 15 minutes for your security.

If you didn't request this login link, you can safely ignore this email.

© 2024 Safe Maternity
www.safe-maternity.com
                    `.trim()
                };
                
                const info = await transporter.sendMail(mailOptions);
                console.log('✅ Magic link email sent successfully via Brevo!');
                console.log('Email info:', {
                    messageId: info.messageId,
                    accepted: info.accepted,
                    response: info.response,
                    to: email
                });
            } catch (emailError) {
                console.error('❌ Failed to send email via Brevo:', emailError.message);
                console.error('Full error:', emailError);
                console.error('Current SMTP Config:', {
                    host: process.env.SMTP_HOST || 'Not set',
                    port: process.env.SMTP_PORT || 'Not set', 
                    from: process.env.SMTP_FROM || 'Not set',
                    user: process.env.SMTP_USER ? 'Set' : 'Not set',
                    pass: process.env.SMTP_PASS ? 'Set' : 'Not set'
                });
                // Still return success but log the error for debugging
            }
        } else {
            // No SMTP credentials configured
            console.log('⚠️ SMTP credentials not configured. Magic link:', magicLink);
            console.log('To enable email sending, configure SMTP_USER and SMTP_PASS environment variables');
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
        
        // Log the verification attempt
        console.log('Magic link verification attempt:', {
            token: token ? `${token.substring(0, 8)}...` : 'missing',
            userAgent: req.headers['user-agent'],
            referer: req.headers['referer']
        });
        
        if (!token) {
            console.error('No token provided in magic link');
            return res.redirect('/login?error=invalid_token');
        }
        
        // Check if token exists and is valid
        const tokenData = magicLinkTokens.get(token);
        
        if (!tokenData) {
            console.error('Token not found in storage:', token.substring(0, 8));
            return res.redirect('/login?error=invalid_token');
        }
        
        if (tokenData.used) {
            console.error('Token already used:', token.substring(0, 8));
            return res.redirect('/login?error=token_used');
        }
        
        if (new Date() > tokenData.expires) {
            console.error('Token expired:', token.substring(0, 8));
            magicLinkTokens.delete(token);
            return res.redirect('/login?error=token_expired');
        }
        
        // Mark token as used
        tokenData.used = true;
        
        // Find or create user by email
        let user = await User.findOne({ email: tokenData.email.toLowerCase() });
        let isNewUser = false;
        
        if (!user) {
            isNewUser = true;
            // Create new user with email
            user = new User({
                email: tokenData.email.toLowerCase(),
                name: tokenData.email.split('@')[0], // Use email prefix as name
                provider: 'email',
                referredBy: tokenData.referralCode || null
            });
            await user.save();
            console.log('Created new user:', user.email);
            
            // Handle referral if referralCode provided
            if (tokenData.referralCode) {
                try {
                    const referrer = await User.findOne({ affiliateCode: tokenData.referralCode });
                    if (referrer && referrer.isPremium) {
                        // Award points to referrer (10 points for signup)
                        await referrer.addReferral(user, 10);
                        console.log(`Referral tracked: ${referrer.email} referred ${user.email}`);
                    } else {
                        console.log('Referral code invalid or referrer not premium:', tokenData.referralCode);
                    }
                } catch (referralError) {
                    console.error('Referral processing error:', referralError);
                }
            }
        } else {
            console.log('Found existing user:', user.email);
        }
        
        // Generate JWT token
        const jwtToken = generateToken(user._id);
        
        // Save session with explicit save to ensure it persists
        req.session.token = jwtToken;
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.loginKeyType = 'email';
        req.session.loginKeyValue = tokenData.email;
        
        // Force session save before redirect
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    reject(err);
                } else {
                    console.log('Session saved successfully');
                    resolve();
                }
            });
        });
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Clean up the magic link token
        magicLinkTokens.delete(token);
        
        console.log('Magic link verified successfully, redirecting user:', user.email);
        
        // Use encodeURIComponent for token in URL to handle special characters
        const encodedToken = encodeURIComponent(jwtToken);
        const redirectUrl = `/app?token=${encodedToken}&premium=${user.isPremium}&auth=success`;
        
        // Send HTML with JavaScript redirect as fallback for email clients
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Login Successful</title>
                <meta http-equiv="refresh" content="0;url=${redirectUrl}">
            </head>
            <body>
                <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                    <h2>✅ Login Successful!</h2>
                    <p>Redirecting to the app...</p>
                    <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
                </div>
                <script>
                    // Store auth data in localStorage as backup
                    localStorage.setItem('authToken', '${jwtToken}');
                    localStorage.setItem('isPremium', '${user.isPremium}');
                    localStorage.setItem('userEmail', '${user.email}');
                    // Redirect
                    window.location.href = '${redirectUrl}';
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Magic link verification error:', error);
        res.redirect('/login?error=auth_failed');
    }
});


// TON Wallet login
router.post('/ton-wallet', async (req, res) => {
    try {
        const { address, publicKey, chain } = req.body;
        
        if (!address) {
            return res.status(400).json({ success: false, error: 'Wallet address required' });
        }
        
        // Find or create user based on TON wallet address
        let user = await User.findOne({ tonWalletAddress: address });
        
        if (!user) {
            user = new User({
                tonWalletAddress: address,
                tonPublicKey: publicKey,
                tonChain: chain,
                provider: 'ton',
                name: `TON User ${address.slice(0, 6)}...${address.slice(-4)}`,
                isPremium: false // Default to free tier, can be updated after payment
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
        
        res.json({
            success: true,
            token,
            isPremium: user.isPremium || false,
            walletAddress: address
        });
    } catch (error) {
        console.error('TON wallet auth error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

// Test email configuration (development only)
router.post('/test-email', async (req, res) => {
    try {
        // Only allow in development or with admin token
        if (process.env.NODE_ENV === 'production' && req.body.adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const testEmail = req.body.email || process.env.TEST_EMAIL;
        
        if (!testEmail) {
            return res.status(400).json({ error: 'Test email address required' });
        }
        
        console.log('Testing Brevo email configuration...');
        
        // Verify transporter configuration
        try {
            await transporter.verify();
            console.log('✅ Brevo SMTP connection verified successfully');
        } catch (verifyError) {
            console.error('❌ Brevo SMTP verification failed:', verifyError);
            return res.status(500).json({ 
                error: 'SMTP verification failed', 
                details: verifyError.message,
                config: {
                    host: process.env.SMTP_HOST || 'Not set',
                    port: process.env.SMTP_PORT || 'Not set',
                    from: process.env.SMTP_FROM || 'Not set',
                    userConfigured: !!process.env.SMTP_USER,
                    passConfigured: !!process.env.SMTP_PASS
                }
            });
        }
        
        // Send test email
        const testMailOptions = {
            from: `"Safe Maternity Test" <${process.env.SMTP_FROM || 'noreply@safe-maternity.com'}>`,
            to: testEmail,
            subject: '✅ Safe Maternity Email Test',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #667eea;">Safe Maternity Email Test</h2>
                    <p>This is a test email to verify that your Brevo email configuration is working correctly.</p>
                    <p><strong>Configuration Details:</strong></p>
                    <ul>
                        <li>SMTP Host: ${process.env.SMTP_HOST || 'Not configured'}</li>
                        <li>SMTP Port: ${process.env.SMTP_PORT || 'Not configured'}</li>
                        <li>From Address: ${process.env.SMTP_FROM || 'Not configured'}</li>
                        <li>Timestamp: ${new Date().toISOString()}</li>
                    </ul>
                    <p style="color: #666; margin-top: 20px;">If you received this email, your Brevo configuration is working! 🎉</p>
                </div>
            `,
            text: `Safe Maternity Email Test\n\nThis is a test email to verify that your Brevo email configuration is working correctly.\n\nIf you received this email, your configuration is working!`
        };
        
        const info = await transporter.sendMail(testMailOptions);
        
        console.log('✅ Test email sent successfully:', info);
        
        res.json({
            success: true,
            message: `Test email sent to ${testEmail}`,
            info: {
                messageId: info.messageId,
                accepted: info.accepted,
                response: info.response
            }
        });
        
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ 
            error: 'Failed to send test email',
            details: error.message
        });
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
        
        // Get decrypted profile data
        const profile = user.getProfile();
        
        res.json({
            authenticated: true,
            id: user._id,
            name: user.name,
            email: user.email,
            profilePicture: user.profilePicture,
            isPremium: user.isPremium,
            provider: user.provider,
            dailySearchesRemaining: user.isPremium ? 'unlimited' : (1 - user.dailySearches.count),
            canSearch: user.isPremium || hasFreebies,
            profile: profile,
            affiliateCode: user.affiliateCode,
            affiliatePoints: user.affiliatePoints
        });
    } catch (error) {
        res.status(401).json({ authenticated: false });
    }
});

module.exports = router;