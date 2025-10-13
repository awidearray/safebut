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
const affiliateRoutes = require('./routes/affiliate');
const paymentRoutes = require('./routes/payment');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for production (needed for secure cookies and proper IPs)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

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
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        sameSite: 'lax' // Allow cookies from email client redirects
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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "frame-src https://js.stripe.com; " +
        "connect-src 'self' http://localhost:* https://api.venice.ai https://api.stripe.com;"
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
app.use('/api/affiliate', affiliateRoutes);

// Payment routes
app.use('/payment', paymentRoutes);

// Main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
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

        // Add user preferences to context
        let preferenceContext = '';
        if (userProfile.preferences) {
            const prefs = userProfile.preferences;
            
            // Measurement preferences
            if (prefs.measurementSystem === 'metric') {
                preferenceContext += '\nUse metric units (kg, °C, ml, cm).';
            } else {
                preferenceContext += '\nUse imperial units (lbs, °F, cups, inches).';
            }
            
            // Caffeine preferences
            if (prefs.caffeineMeasurement === 'milligrams') {
                preferenceContext += '\nFor caffeine, use milligrams (e.g., "200mg limit" instead of "1-2 cups").';
            } else {
                preferenceContext += '\nFor caffeine, use cups/servings (e.g., "1-2 cups" instead of mg amounts).';
            }
            
            // Temperature preferences
            if (prefs.temperatureUnit === 'celsius') {
                preferenceContext += '\nUse Celsius for temperatures.';
            } else {
                preferenceContext += '\nUse Fahrenheit for temperatures.';
            }
            
            // Detail level
            if (prefs.detailLevel === 'detailed') {
                preferenceContext += '\nProvide comprehensive explanations with detailed medical information.';
            } else {
                preferenceContext += '\nKeep explanations brief and to the point.';
            }
            
            // Language style
            if (prefs.languageStyle === 'scientific') {
                preferenceContext += '\nUse medical terminology and scientific language.';
            } else {
                preferenceContext += '\nUse simple, easy-to-understand language.';
            }
            
            // Risk communication
            if (prefs.riskStyle === 'reassuring') {
                preferenceContext += '\nEmphasize what is safe and reassuring where appropriate.';
            } else if (prefs.riskStyle === 'cautious') {
                preferenceContext += '\nEmphasize potential risks and err on the side of caution.';
            } else {
                preferenceContext += '\nPresent risks and benefits in a balanced way.';
            }
        }

        const includeBreastfeeding = !!(user && user.isPremium);

        const prompt = includeBreastfeeding
            ? `Provide a concise, dual safety assessment of "${item}" for both pregnancy and breastfeeding.${contextInfo}${preferenceContext}

Respond EXACTLY in this structured format:
PREGNANCY_RISK_SCORE: [1-10]
BREASTFEEDING_RISK_SCORE: [1-10]
PREGNANCY:
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence]
TIPS:
- [short tip 1]
- [short tip 2]

BREASTFEEDING:
SAFETY: [Safe/Caution/Avoid]
WHY: [1 sentence]
TIPS:
- [short tip 1]
- [short tip 2]`
            : `Is "${item}" safe during pregnancy? ${contextInfo}${preferenceContext}
Give risk score 1-10 (1=safest, 10=most dangerous). Consider any mentioned conditions. Follow user preferences for units and communication style:
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
        // Parse risk scores for either single or dual format
        let responseData;
        if (includeBreastfeeding) {
            const pregMatch = aiResponse.match(/PREGNANCY_RISK_SCORE:\s*(\d+)/i);
            const bfMatch = aiResponse.match(/BREASTFEEDING_RISK_SCORE:\s*(\d+)/i);
            const pregnancyRiskScore = pregMatch ? parseInt(pregMatch[1]) : 5;
            const breastfeedingRiskScore = bfMatch ? parseInt(bfMatch[1]) : null;
            responseData = {
                result: aiResponse,
                hasBothSections: true,
                pregnancyRiskScore,
                breastfeedingRiskScore,
                references
            };
            // Track usage and history if authenticated
            if (user) {
                const canSearch = await user.checkDailyLimit();
                if (!canSearch && !user.isPremium) {
                    return res.status(403).json({ 
                        error: 'Daily limit reached', 
                        message: 'You\'ve used your free daily check. Upgrade to premium for unlimited checks!',
                        requiresUpgrade: true 
                    });
                }
                await user.incrementSearchCount();
                await user.addToHistory(item, pregnancyRiskScore);
            } else {
                if (!req.session.trialSearchCount) req.session.trialSearchCount = 0;
                req.session.trialSearchCount++;
                if (req.session.trialSearchCount > 1) {
                    return res.status(403).json({ 
                        error: 'Trial limit reached', 
                        message: 'Trial users get 1 free check. Please sign up for unlimited access!',
                        requiresUpgrade: true 
                    });
                }
            }
            return res.json(responseData);
        }

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
app.post('/api/check-image-safety', verifyToken, requirePremium, async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';

        try {
            // Primary: vision model
            const requestBody = {
                model: 'llama-3.2-90b-vision',
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
                                image_url: { url: image }
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

            // Track usage/history for authenticated user
            if (req.user) {
                await req.user.incrementSearchCount();
                await req.user.addToHistory('Image Analysis', riskScore, true);
            }

            const references = [
                { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
            ];

            return res.json({ result: aiResponse, riskScore, references });
        } catch (visionError) {
            // Fallback: text-only response if vision fails
            try {
                const fallbackRequestBody = {
                    model: 'llama-3.3-70b',
                    messages: [
                        {
                            role: 'system',
                            content: 'Medical expert. Answer pregnancy safety questions about items shown in images. Brief, factual only.'
                        },
                        {
                            role: 'user',
                            content: `An image was uploaded for pregnancy safety analysis. Since I cannot see the image, please provide general guidance:
RISK_SCORE: 5
SAFETY: Caution
WHY: Unable to analyze image directly - please describe what you want to check for specific guidance
TIPS: Take a clear photo in good lighting, or type what you want to check instead of uploading an image`
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 150
                };

                const fallbackResponse = await axios.post(apiUrl, fallbackRequestBody, {
                    headers: {
                        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                const aiResponse = fallbackResponse.data.choices[0].message.content;
                const references = [
                    { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                    { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                    { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
                ];

                return res.json({ result: aiResponse, riskScore: 5, references });
            } catch (fallbackError) {
                console.error('Fallback image analysis failed:', fallbackError.response?.data || fallbackError.message);
                return res.status(500).json({ 
                    error: 'Failed to analyze image. Please try again later.',
                    details: fallbackError.response?.data?.error || fallbackError.message 
                });
            }
        }
    } catch (error) {
        console.error('Image analysis error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to analyze image. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Detailed Safety Information endpoint
app.post('/api/detailed-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            console.error('VENICE_API_KEY is not set in environment variables');
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { item } = req.body;
        
        // Try to get authenticated user for personalization
        let user = null;
        let userProfile = {};
        
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

        // Add user preferences to context
        let preferenceContext = '';
        if (userProfile.preferences) {
            const prefs = userProfile.preferences;
            
            if (prefs.measurementSystem === 'metric') {
                preferenceContext += '\nUse metric units (kg, °C, ml, cm).';
            } else {
                preferenceContext += '\nUse imperial units (lbs, °F, cups, inches).';
            }
            
            if (prefs.caffeineMeasurement === 'milligrams') {
                preferenceContext += '\nFor caffeine, use milligrams (e.g., "200mg limit" instead of "1-2 cups").';
            } else {
                preferenceContext += '\nFor caffeine, use cups/servings (e.g., "1-2 cups" instead of mg amounts).';
            }
            
            if (prefs.temperatureUnit === 'celsius') {
                preferenceContext += '\nUse Celsius for temperatures.';
            } else {
                preferenceContext += '\nUse Fahrenheit for temperatures.';
            }
            
            // For detailed answers, always provide comprehensive information regardless of brief/detailed preference
            preferenceContext += '\nProvide comprehensive, detailed explanations with specific medical information.';
            
            if (prefs.languageStyle === 'scientific') {
                preferenceContext += '\nUse medical terminology and scientific language.';
            } else {
                preferenceContext += '\nUse clear, understandable language while being comprehensive.';
            }
            
            if (prefs.riskStyle === 'reassuring') {
                preferenceContext += '\nEmphasize what is safe and provide reassuring information where appropriate.';
            } else if (prefs.riskStyle === 'cautious') {
                preferenceContext += '\nEmphasize potential risks and provide thorough cautions.';
            } else {
                preferenceContext += '\nPresent both risks and benefits in a balanced, detailed way.';
            }
        }

        const prompt = `Provide a comprehensive, detailed analysis of "${item}" during pregnancy. ${contextInfo}${preferenceContext}

Please provide a thorough examination including:

1. **Safety Overview**: Detailed safety assessment and risk level
2. **Trimester Considerations**: How safety/recommendations change by trimester
3. **Dosage/Amount Guidelines**: Specific limits and recommendations if applicable
4. **Medical Mechanisms**: How this affects pregnancy and fetal development
5. **Special Circumstances**: Considerations for high-risk pregnancies or specific conditions
6. **Practical Guidelines**: Detailed practical advice and alternatives
7. **Warning Signs**: What symptoms to watch for
8. **Healthcare Consultation**: When to contact healthcare providers

Be comprehensive and evidence-based. Address any specific conditions mentioned.`;

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'llama-3.3-70b',
            messages: [
                {
                    role: 'system',
                    content: 'You are a comprehensive pregnancy health expert providing detailed, evidence-based information. Give thorough, well-structured responses with specific medical guidance while considering patient-specific conditions and preferences.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 800
        };

        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        
        res.json({ 
            result: aiResponse
        });
    } catch (error) {
        console.error('Venice AI detailed API error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to get detailed information. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Detailed Image Analysis endpoint
app.post('/api/detailed-image-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { image } = req.body;
        
        // Try to get authenticated user for personalization
        let user = null;
        let userProfile = {};
        
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

        // Build personalized context
        let contextInfo = '';
        if (userProfile.trimester) {
            contextInfo += `\nCurrently in ${userProfile.trimester} trimester.`;
        }
        if (userProfile.conditions) {
            const activeConditions = Object.entries(userProfile.conditions)
                .filter(([key, value]) => value === true);
            if (activeConditions.length > 0) {
                contextInfo += `\nPatient has specific medical conditions that may affect recommendations.`;
            }
        }
        
        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'mistral-31-24b',  // Vision-capable model
            messages: [
                {
                    role: 'system',
                    content: 'You are a comprehensive medical expert analyzing images for detailed pregnancy safety assessment. Provide thorough, evidence-based analysis with specific guidance.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Provide a comprehensive analysis of what's shown in this image regarding pregnancy safety. ${contextInfo}

Please include:

1. **Item Identification**: What you see in the image
2. **Detailed Safety Assessment**: Comprehensive safety evaluation
3. **Specific Risks/Benefits**: Detailed explanation of any risks or benefits
4. **Trimester Considerations**: How recommendations might vary by pregnancy stage
5. **Usage Guidelines**: Specific recommendations for safe use if applicable
6. **Alternatives**: Safer alternatives if the item should be avoided
7. **Medical Considerations**: How this relates to pregnancy health
8. **When to Consult**: Specific situations requiring medical consultation

Be thorough and evidence-based in your analysis.`
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
            temperature: 0.2,
            max_tokens: 600
        };
        
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        
        res.json({ 
            result: aiResponse
        });
    } catch (error) {
        console.error('Detailed image analysis error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to get detailed image analysis. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Log Entries API (Premium feature)
app.post('/api/log-entry', async (req, res) => {
    try {
        // Check for auth token (same pattern as /api/check-safety)
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.session?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify token and get user
        let user = null;
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const User = require('./models/User');
            user = await User.findById(decoded.userId);
        } catch (authError) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }
        
        const { text, type, audioUrl } = req.body;
        const entry = {
            id: Date.now().toString(),
            date: new Date(),
            text,
            type: type || 'text',
            audioUrl,
            createdAt: new Date()
        };
        
        user.logEntries.push(entry);
        await user.save();
        
        res.json(entry);
    } catch (error) {
        console.error('Error saving log entry:', error);
        res.status(500).json({ error: 'Failed to save log entry' });
    }
});

app.get('/api/log-entries', async (req, res) => {
    try {
        // Check for auth token (same pattern as /api/check-safety)
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.session?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify token and get user
        let user = null;
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const User = require('./models/User');
            user = await User.findById(decoded.userId);
        } catch (authError) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }
        
        res.json(user.logEntries || []);
    } catch (error) {
        console.error('Error loading log entries:', error);
        res.status(500).json({ error: 'Failed to load log entries' });
    }
});

app.post('/api/analyze-log-entry', async (req, res) => {
    try {
        // Check for auth token (same pattern as /api/check-safety)
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.session?.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify token and get user
        let user = null;
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const User = require('./models/User');
            user = await User.findById(decoded.userId);
        } catch (authError) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }
        
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text required for analysis' });
        }
        
        const prompt = `Analyze this pregnancy log entry and provide detailed health insights:
        
Entry: "${text}"

Please provide:
1. Health Assessment - What this might indicate about the pregnancy
2. Important Observations - Key things to note
3. Recommendations - What actions to consider
4. When to Contact Doctor - Any concerning signs

Format as HTML with clear sections and bullet points.`;

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: 'llama-3.3-70b',
            messages: [
                {
                    role: 'system',
                    content: 'You are a pregnancy health expert providing detailed analysis of pregnancy diary entries. Be thorough, supportive, and medically accurate.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        };
        
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const aiResponse = response.data.choices[0].message.content;
        
        res.json({ result: aiResponse });
    } catch (error) {
        console.error('Venice AI analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze entry' });
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

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Pregnancy Safety Checker (Premium) is running on http://localhost:${PORT}`);
        console.log(`Open your browser and navigate to http://localhost:${PORT}`);
    });
}

// Export app for Vercel
module.exports = app;