require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/database');

// Import middleware
const { verifyToken, requirePremium } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Simple in-memory cache
const responseCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
}));


app.use(cors({
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true
}));
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

// Auth routes
app.use('/auth', authRoutes);

// Payment routes
app.use('/payment', paymentRoutes);

// Main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login-simple.html'));
});

app.get('/app', async (req, res) => {
    try {
        // Check if it's a trial user
        if (req.query.trial === 'true') {
            // Trial users can access without login
            return res.sendFile(path.join(__dirname, 'app.html'));
        }
        
        // Check for token in query or session
        const token = req.query.token || req.session.token;
        
        if (!token) {
            // No token, allow trial access
            return res.sendFile(path.join(__dirname, 'app.html'));
        }
        
        // Verify token and get user if provided
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (user) {
                // Store in session for future requests
                req.session.token = token;
                req.session.userId = user._id;
            }
        } catch (tokenError) {
            console.log('Token verification failed, allowing trial access');
        }
        
        // Serve the app to all users
        res.sendFile(path.join(__dirname, 'app.html'));
    } catch (error) {
        console.error('App access error:', error);
        // On any error, still serve the app for trial users
        res.sendFile(path.join(__dirname, 'app.html'));
    }
});

// Upgrade page for non-premium users
app.get('/upgrade', async (req, res) => {
    // Check if user is logged in
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'upgrade.html'));
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

// API endpoints for profile management
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const profile = req.user.getProfile();
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

app.post('/api/profile', verifyToken, async (req, res) => {
    try {
        await req.user.saveProfile(req.body);
        res.json({ success: true, message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Save profile error:', error);
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// API endpoint for safety checks (1 free per day for trial/free users, unlimited for premium)
app.post('/api/check-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            console.error('VENICE_API_KEY is not set in environment variables');
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { item } = req.body;
        
        // Try to get authenticated user
        let user = null;
        let userProfile = {};
        
        // Check for auth token
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.session?.token;
        
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const User = require('./models/User');
                user = await User.findById(decoded.userId);
                if (user) {
                    userProfile = user.getProfile();
                }
            } catch (authError) {
                console.log('Auth failed, continuing as trial user');
            }
        }
        
        // Check cache first
        const cacheKey = item.toLowerCase();
        const cached = responseCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('Returning cached response for:', cacheKey);
            
            // Still increment search count and save to history
            await req.user.incrementSearchCount();
            await req.user.addToHistory(item, cached.data.riskScore);
            
            return res.json(cached.data);
        }

        // Build personalized context from user profile
        let contextInfo = '';
        if (userProfile.conditions) {
            const activeConditions = Object.entries(userProfile.conditions)
                .filter(([key, value]) => value === true)
                .map(([key, value]) => {
                    const conditionMap = {
                        'gestational-diabetes': 'gestational diabetes',
                        'preeclampsia': 'preeclampsia/high blood pressure',
                        'anemia': 'anemia',
                        'thyroid': 'thyroid disorders',
                        'placenta-previa': 'placenta previa',
                        'hyperemesis': 'hyperemesis gravidarum',
                        'rh-negative': 'Rh negative blood type',
                        'multiples': 'multiple pregnancy (twins/triplets)'
                    };
                    return conditionMap[key] || key;
                });
            if (activeConditions.length > 0) {
                contextInfo += `\nPatient has: ${activeConditions.join(', ')}.`;
            }
        }
        
        if (userProfile.trimester) {
            contextInfo += `\nCurrently in ${userProfile.trimester} trimester.`;
        }
        
        if (userProfile.age && parseInt(userProfile.age) >= 35) {
            contextInfo += `\nAdvanced maternal age (${userProfile.age}).`;
        }

        const prompt = `Is "${item}" safe during pregnancy? ${contextInfo}
Give risk score 1-10 (1=safest, 10=most dangerous). Consider any mentioned conditions. Be brief:
RISK_SCORE: [1-10]
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence explanation]
TIPS: [2-3 short practical tips specific to the patient's conditions if applicable]`;

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'llama-3.3-70b',
            messages: [
                {
                    role: 'system',
                    content: 'Medical expert specializing in pregnancy. Answer pregnancy safety questions considering patient-specific conditions. Brief, factual, personalized advice when conditions are present.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 150
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
        
        // Check daily limit for authenticated free users
        if (user) {
            const canSearch = await user.checkDailyLimit();
            if (!canSearch && !user.isPremium) {
                return res.status(403).json({ 
                    error: 'Daily limit reached', 
                    message: 'You\'ve used your free daily check. Upgrade to premium for unlimited checks!',
                    requiresUpgrade: true 
                });
            }
            
            // Increment search count and save to user's history
            await user.incrementSearchCount();
            await user.addToHistory(item, riskScore);
        } else {
            // Trial users get 1 check per session
            if (!req.session.trialSearchCount) {
                req.session.trialSearchCount = 0;
            }
            req.session.trialSearchCount++;
            
            if (req.session.trialSearchCount > 1) {
                return res.status(403).json({ 
                    error: 'Trial limit reached', 
                    message: 'Trial users get 1 free check. Please sign up for unlimited access!',
                    requiresUpgrade: true 
                });
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

// Image analysis endpoint (premium feature only)
app.post('/api/check-image-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { image } = req.body;
        
        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'mistral-31-24b',  // Vision-capable model
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical expert analyzing images for pregnancy safety. Provide accurate, evidence-based assessments.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this image and determine if what's shown is safe during pregnancy. Provide:
RISK_SCORE: [1-10, where 1 is safest and 10 is most dangerous]
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence explanation of what you see and why it's safe or not]
TIPS: [2-3 short practical tips based on what's in the image]`
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
        
        // Increment search count and save to history
        await req.user.incrementSearchCount();
        await req.user.addToHistory('Image Analysis', riskScore, true);
        
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
            error: 'Failed to analyze image. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Get user's search history
app.get('/api/history', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('searchHistory');
        res.json(user.searchHistory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.listen(PORT, () => {
    console.log(`Pregnancy Safety Checker (Premium) is running on http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});