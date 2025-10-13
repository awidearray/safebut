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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safebut');

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
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/safebut',
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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "frame-src https://oauth.telegram.org; " +
        "connect-src 'self' http://localhost:* https://api.venice.ai https://telegram.org;"
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
app.use('/auth', authRoutes);

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
        
        // Use Venice AI's vision model to analyze the image
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
                                url: image  // The base64 image data from client
                            }
                        }
                    ]
                }
            ],
            temperature: 0.3,
            max_tokens: 200
        };

        console.log('Analyzing image with vision model...');
        
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
            error: 'Failed to analyze image. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Pregnancy Safety Checker is running on http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});