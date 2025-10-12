require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory cache
const responseCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Daily usage tracking (in-memory for non-authenticated users)
const dailyUsage = new Map();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Add CSP headers middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://telegram.org; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "frame-src https://js.stripe.com https://oauth.telegram.org; " +
        "connect-src 'self' http://localhost:* https://api.venice.ai https://api.stripe.com https://telegram.org;"
    );
    next();
});

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login-simple.html'));
});

app.get('/app', (req, res) => {
    // Allow access to app without authentication (free tier with limits)
    res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/upgrade', (req, res) => {
    res.sendFile(path.join(__dirname, 'upgrade.html'));
});

app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'privacy-policy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms-of-service.html'));
});

app.get('/delete-my-data', (req, res) => {
    res.sendFile(path.join(__dirname, 'delete-my-data.html'));
});

// Serve static files explicitly for Vercel
app.get('/styles.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/app.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'app.js'));
});

// Simple auth endpoints (no database required for basic functionality)
app.post('/auth/email-login', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }
        
        // For production without database, just create a simple token
        const simpleToken = Buffer.from(JSON.stringify({
            email,
            timestamp: Date.now()
        })).toString('base64');
        
        return res.json({
            success: true,
            token: simpleToken,
            isPremium: false,
            user: {
                email: email,
                name: email.split('@')[0],
                isPremium: false
            }
        });
        
    } catch (error) {
        console.error('Email login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// Telegram auth (simplified without database)
app.post('/auth/telegram', async (req, res) => {
    try {
        const authData = req.body;
        
        // Create a simple token
        const simpleToken = Buffer.from(JSON.stringify({
            telegramId: authData.id,
            name: authData.first_name,
            timestamp: Date.now()
        })).toString('base64');
        
        return res.json({
            success: true,
            token: simpleToken,
            isPremium: false,
            user: {
                name: `${authData.first_name} ${authData.last_name || ''}`.trim(),
                username: authData.username,
                isPremium: false
            }
        });
        
    } catch (error) {
        console.error('Telegram login error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

// Get current user (simplified)
app.get('/auth/me', async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.json({ 
            authenticated: false,
            canSearch: true, // Allow 1 free search
            dailySearchesRemaining: 1
        });
    }
    
    try {
        const userData = JSON.parse(Buffer.from(token, 'base64').toString());
        res.json({
            authenticated: true,
            user: {
                email: userData.email,
                name: userData.name || userData.email?.split('@')[0],
                isPremium: false
            },
            canSearch: true,
            dailySearchesRemaining: 1
        });
    } catch (error) {
        res.json({ 
            authenticated: false,
            canSearch: true,
            dailySearchesRemaining: 1
        });
    }
});

// Stripe payment endpoints (simplified)
app.post('/payment/create-checkout-session', async (req, res) => {
    try {
        // Check if Stripe is configured
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(503).json({ 
                error: 'Payment system not configured. Please contact support.',
                requiresSetup: true 
            });
        }
        
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Safebut? Lifetime Premium Access',
                        description: 'Unlimited pregnancy safety checks forever'
                    },
                    unit_amount: 99 // $0.99 in cents
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${process.env.APP_URL || 'https://safebut.com'}/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || 'https://safebut.com'}/upgrade`
        });
        
        res.json({
            sessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ 
            error: 'Failed to create checkout session. Please try again later.' 
        });
    }
});

// Helper function to get client IP
function getClientIp(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.ip ||
           'unknown';
}

// Helper function to check daily limit
function checkDailyLimit(clientId) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (dailyUsage.has(clientId)) {
        const usage = dailyUsage.get(clientId);
        
        // Reset if it's a new day
        if (now - usage.firstUse > oneDay) {
            dailyUsage.set(clientId, { count: 1, firstUse: now });
            return true;
        }
        
        // Check if under limit
        if (usage.count < 1) {
            usage.count++;
            return true;
        }
        
        return false;
    } else {
        // First use
        dailyUsage.set(clientId, { count: 1, firstUse: now });
        return true;
    }
}

// API endpoint for safety checks (with rate limiting for free users)
app.post('/api/check-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            console.error('VENICE_API_KEY is not set in environment variables');
            return res.status(500).json({ error: 'AI service not configured. Please try again later.' });
        }

        const { item } = req.body;
        const clientId = getClientIp(req);
        
        // Check rate limit for free users
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            // Check daily limit for non-authenticated users
            if (!checkDailyLimit(clientId)) {
                return res.status(403).json({ 
                    error: 'Daily limit reached', 
                    message: 'You\'ve used your free daily check. Sign in or upgrade to premium for unlimited checks!',
                    requiresUpgrade: true 
                });
            }
        }
        
        // Check cache first
        const cacheKey = item.toLowerCase();
        const cached = responseCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('Returning cached response for:', cacheKey);
            return res.json(cached.data);
        }

        const prompt = `Is "${item}" safe during pregnancy? Give risk score 1-10 (1=safest, 10=most dangerous). Be brief:
RISK_SCORE: [1-10]
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence explanation]
TIPS: [2-3 short practical tips]`;

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'llama-3.3-70b',
            messages: [
                {
                    role: 'system',
                    content: 'Medical expert. Answer pregnancy safety questions. Brief, factual only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 150
        };

        console.log('Making request to Venice AI...');

        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        
        // Parse the response to extract risk score
        const riskScoreMatch = aiResponse.match(/RISK_SCORE:\s*(\d+)/);
        const riskScore = riskScoreMatch ? parseInt(riskScoreMatch[1]) : 5;
        
        // Generate general pregnancy safety reference links
        const references = [
            { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
            { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
            { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
        ];
        
        const responseData = { 
            result: aiResponse,
            riskScore: riskScore,
            references: references
        };
        
        // Cache the response
        responseCache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });
        
        // Clean old cache entries periodically
        if (responseCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of responseCache.entries()) {
                if (now - value.timestamp > CACHE_DURATION) {
                    responseCache.delete(key);
                }
            }
        }
        
        res.json(responseData);
    } catch (error) {
        console.error('Venice AI API error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to check safety. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Image analysis endpoint
app.post('/api/check-image-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { image } = req.body;
        const clientId = getClientIp(req);
        
        // Check rate limit
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token && !checkDailyLimit(clientId)) {
            return res.status(403).json({ 
                error: 'Daily limit reached', 
                message: 'Sign in or upgrade for unlimited image checks!',
                requiresUpgrade: true 
            });
        }
        
        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'mistral-31-24b',
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical expert analyzing images for pregnancy safety.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this image and determine if what's shown is safe during pregnancy. Provide:
RISK_SCORE: [1-10, where 1 is safest and 10 is most dangerous]
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence explanation]
TIPS: [2-3 short practical tips]`
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: image
                            }
                        }
                    ]
                }
            ],
            temperature: 0.3,
            max_tokens: 200
        };
        
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        const riskScoreMatch = aiResponse.match(/RISK_SCORE:\s*(\d+)/);
        const riskScore = riskScoreMatch ? parseInt(riskScoreMatch[1]) : 5;
        
        const references = [
            { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
            { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
            { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
        ];
        
        res.json({ 
            result: aiResponse,
            riskScore: riskScore,
            references: references
        });
    } catch (error) {
        console.error('Image analysis error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to analyze image. Please try again later.'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
    });
});

app.listen(PORT, () => {
    console.log(`Safebut? Production Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`Venice AI: ${process.env.VENICE_API_KEY ? 'Configured' : 'Not configured'}`);
    console.log(`Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured'}`);
});
