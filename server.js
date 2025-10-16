require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind a proxy (e.g., Vercel/Heroku), trust proxy to get correct protocol/host
app.set('trust proxy', true);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safematernity');

mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

// Simple in-memory cache
const responseCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Session middleware with MongoDB store
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/safematernity',
        touchAfter: 24 * 3600 // Lazy session update (once per 24 hours unless session data changes)
    }),
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Add CSP headers middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' http://localhost:* https://api.venice.ai;"
    );
    next();
});

// Serve static files with correct MIME types and cache control
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        // Prevent caching of HTML files
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Import and mount auth routes
const authRoutes = require('./routes/auth');
const affiliateRoutes = require('./routes/affiliate');
app.use('/auth', authRoutes);
app.use('/api/affiliate', affiliateRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'policy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms.html'));
});

app.get('/safety', (req, res) => {
    res.sendFile(path.join(__dirname, 'safety.html'));
});

app.get('/delete-my-data', (req, res) => {
    res.sendFile(path.join(__dirname, 'delete-my-data.html'));
});

app.get('/guide', (req, res) => {
    res.sendFile(path.join(__dirname, 'guide.html'));
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

app.get('/logo.png', (req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(path.join(__dirname, 'logo.png'));
});

// Keep SVG route for backward compatibility
app.get('/logo.svg', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(path.join(__dirname, 'logo.svg'));
});

app.post('/api/check-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            console.error('VENICE_API_KEY is not set in environment variables');
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        console.log('API Key loaded:', process.env.VENICE_API_KEY.substring(0, 10) + '...');

        const { item } = req.body;
        
        // Check cache first
        const cacheKey = item.toLowerCase();
        const cached = responseCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('Returning cached response for:', cacheKey);
            return res.json(cached.data);
        }

        // Get user profile for preferences (server-side defaults to empty)
        const profile = {};
        let preferenceContext = '';
        
        if (profile.preferences) {
            const prefs = profile.preferences;
            
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
                preferenceContext += '\nProvide comprehensive explanations.';
            } else {
                preferenceContext += '\nKeep explanations brief.';
            }
            
            // Language style
            if (prefs.languageStyle === 'scientific') {
                preferenceContext += '\nUse medical terminology.';
            } else {
                preferenceContext += '\nUse simple language.';
            }
            
            // Risk communication
            if (prefs.riskStyle === 'reassuring') {
                preferenceContext += '\nEmphasize safety where appropriate.';
            } else if (prefs.riskStyle === 'cautious') {
                preferenceContext += '\nEmphasize potential risks.';
            } else {
                preferenceContext += '\nPresent balanced information.';
            }
        }

        // Local server: support dual output if the caller is premium via session
        const isPremium = req.session?.userId ? true : false; // local dev heuristic
        const prompt = isPremium
            ? `Provide a concise, dual safety assessment of "${item}" for both pregnancy and breastfeeding.${preferenceContext}

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
            : `Is "${item}" safe during pregnancy?${preferenceContext} Give risk score 1-10 (1=safest, 10=most dangerous). Follow user preferences for units and style. Be brief:
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

        console.log('Making request to:', apiUrl);
        console.log('Request body:', JSON.stringify(requestBody, null, 2));

        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        
        // Parse the response to extract risk score
        // Parse single or dual format
        const pregMatch = aiResponse.match(/PREGNANCY_RISK_SCORE:\s*(\d+)/i);
        const bfMatch = aiResponse.match(/BREASTFEEDING_RISK_SCORE:\s*(\d+)/i);
        if (pregMatch) {
            const pregnancyRiskScore = parseInt(pregMatch[1]) || 5;
            const breastfeedingRiskScore = bfMatch ? parseInt(bfMatch[1]) : null;
            const responseData = {
                result: aiResponse,
                hasBothSections: true,
                pregnancyRiskScore,
                breastfeedingRiskScore,
                references
            };
            // Cache the response
            responseCache.set(cacheKey, {
                data: responseData,
                timestamp: Date.now()
            });
            return res.json(responseData);
        }

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
        console.error('Status:', error.response?.status);
        console.error('Headers:', error.response?.headers);
        res.status(500).json({ 
            error: 'Failed to check safety. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

app.post('/api/check-image-safety', async (req, res) => {
    try {
        if (!process.env.VENICE_API_KEY) {
            return res.status(500).json({ error: 'Venice API key not configured' });
        }

        const { image } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }
        
        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        
        // Try multiple vision models in order of preference
        const visionModels = [
            'pixtral-large-latest',
            'llama-3.2-90b-vision-instruct',
            'llama-3.2-11b-vision-instruct'
        ];

        let lastError = null;
        
        for (const modelName of visionModels) {
            try {
                console.log(`🔍 Attempting image analysis with model: ${modelName}`);
                
                const visionRequestBody = {
                    model: modelName,
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
                                        url: image  // The base64 image data from client
                                    }
                                }
                            ]
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 200,
                    timeout: 30000
                };
                
                const response = await axios.post(apiUrl, visionRequestBody, {
                    headers: {
                        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                console.log(`✅ Image analysis successful with model: ${modelName}`);
                
                const aiResponse = response.data.choices[0].message.content;
                const riskScoreMatch = aiResponse.match(/RISK_SCORE:\s*(\d+)/);
                const riskScore = riskScoreMatch ? parseInt(riskScoreMatch[1]) : 5;
                
                const references = [
                    { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                    { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                    { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
                ];
                
                return res.json({ 
                    result: aiResponse,
                    riskScore: riskScore,
                    references: references
                });
                
            } catch (visionError) {
                lastError = visionError;
                console.error(`❌ Model ${modelName} failed:`, visionError.response?.data || visionError.message);
            }
        }
        
        // If all vision models failed, try fallback to text-only analysis
        if (lastError) {
            console.log('All vision models failed, attempting text fallback...');
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
                
                return res.json({ 
                    result: aiResponse,
                    riskScore: 5,
                    references: [
                        { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                        { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                        { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
                    ]
                });
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError.response?.data || fallbackError.message);
                // Final graceful fallback without external API
                const generic = `RISK_SCORE: 5\nSAFETY: Caution\nWHY: Unable to analyze the image right now.\nTIPS: Try again with a clearer photo, Good lighting helps, You can also type what you want to check`;
                return res.json({
                    result: generic,
                    riskScore: 5,
                    references: [
                        { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                        { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                        { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
                    ]
                });
            }
        }
    } catch (error) {
        console.error('Image analysis setup error:', error.message);
        // Final catch-all graceful response
        const generic = `RISK_SCORE: 5\nSAFETY: Caution\nWHY: Unable to analyze the image right now.\nTIPS: Try again with a clearer photo, Good lighting helps, You can also type what you want to check`;
        return res.json({
            result: generic,
            riskScore: 5,
            references: [
                { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
            ]
        });
    }
});

// Log Entries API (Premium feature)
app.post('/api/log-entry', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Get user from session
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const User = require('./models/User');
        const user = await User.findById(userId);
        
        if (!user || !user.isPremium) {
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
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const User = require('./models/User');
        const user = await User.findById(userId);
        
        if (!user || !user.isPremium) {
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
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
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

app.listen(PORT, () => {
    console.log(`Pregnancy Safety Checker is running on http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});