// Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
    try {
        require('dotenv').config();
    } catch (error) {
        console.log('No .env file found, using environment variables');
    }
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

// Conditionally load MongoStore only if MongoDB is configured
let MongoStore;
if (process.env.MONGODB_URI || process.env.mongodb_uri) {
    try {
        MongoStore = require('connect-mongo');
    } catch (error) {
        console.log('connect-mongo not available, using MemoryStore for sessions');
    }
}

let connectDB;
try {
    connectDB = require('./config/database');
} catch (error) {
    console.log('Database module not available');
}

// Import middleware with error handling
let verifyToken, requirePremium;
try {
    const authMiddleware = require('./middleware/auth');
    verifyToken = authMiddleware.verifyToken;
    requirePremium = authMiddleware.requirePremium;
} catch (error) {
    console.error('Auth middleware not available:', error.message);
    // Provide fallback middleware
    verifyToken = (req, res, next) => {
        res.status(503).json({ error: 'Authentication service unavailable' });
    };
    requirePremium = (req, res, next) => {
        res.status(503).json({ error: 'Premium service unavailable' });
    };
}

// Import routes with error handling
let authRoutes, affiliateRoutes, paymentRoutes, User;
try {
    authRoutes = require('./routes/auth');
} catch (error) {
    console.error('Auth routes not available:', error.message);
}

try {
    affiliateRoutes = require('./routes/affiliate');
} catch (error) {
    console.error('Affiliate routes not available:', error.message);
}

try {
    paymentRoutes = require('./routes/payment');
} catch (error) {
    console.error('Payment routes not available:', error.message);
}

try {
    User = require('./models/User');
} catch (error) {
    console.error('User model not available:', error.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for production (needed for secure cookies and proper IPs)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Connect to MongoDB (gracefully skip if not configured to avoid serverless crash)
if ((process.env.MONGODB_URI || process.env.mongodb_uri) && connectDB) {
    try {
        connectDB();
    } catch (error) {
        console.error('Failed to connect to database:', error.message);
    }
} else {
    console.warn('MONGODB_URI is not set or database module unavailable. Running without database connection.');
}

// Simple in-memory cache
const responseCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Session configuration with better error handling for serverless
const sessionConfig = {
    secret: process.env.SESSION_SECRET || process.env.session_secret || 'safebut-default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        sameSite: 'lax' // Allow cookies from email client redirects
    }
};

// Only add MongoDB store if available and configured
if ((process.env.MONGODB_URI || process.env.mongodb_uri) && MongoStore) {
    try {
        sessionConfig.store = MongoStore.create({
            mongoUrl: process.env.MONGODB_URI || process.env.mongodb_uri,
            ttl: 14 * 24 * 60 * 60, // 14 days
            touchAfter: 24 * 3600 // lazy session update
        });
    } catch (error) {
        console.error('Failed to create MongoDB session store:', error.message);
    }
}

app.use(session(sessionConfig));


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
        } else if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
            res.setHeader('Content-Type', 'application/manifest+json');
        }
    }
}));

// Auth routes (with fallback if not available)
if (authRoutes) {
    app.use('/auth', authRoutes);
} else {
    app.use('/auth', (req, res) => {
        res.status(503).json({ error: 'Authentication service temporarily unavailable' });
    });
}

if (affiliateRoutes) {
    app.use('/api/affiliate', affiliateRoutes);
}

// Payment routes (with fallback)
if (paymentRoutes) {
    app.use('/payment', paymentRoutes);
} else {
    app.use('/payment', (req, res) => {
        res.status(503).json({ error: 'Payment service temporarily unavailable' });
    });
}

// Error handler for async routes
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Main pages with error handling
app.get('/', asyncHandler((req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(500).send('Server configuration error. Please contact support.');
        }
    });
}));

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

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms.html'));
});

app.get('/safety', (req, res) => {
    res.sendFile(path.join(__dirname, 'safety.html'));
});

app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'policy.html'));
});

app.get('/delete-my-data', (req, res) => {
    res.sendFile(path.join(__dirname, 'delete-my-data.html'));
});

// Additional page routes
app.get('/guide', (req, res) => {
    res.sendFile(path.join(__dirname, 'guide.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'faq.html'));
});

app.get('/medical', (req, res) => {
    res.sendFile(path.join(__dirname, 'medical.html'));
});

app.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'privacy-policy.html'));
});

app.get('/terms-of-service', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms-of-service.html'));
});

// Debug/test pages (optional - can be removed in production)
if (process.env.NODE_ENV !== 'production') {
    app.get('/test-app', (req, res) => {
        res.sendFile(path.join(__dirname, 'test-app.html'));
    });
    
    app.get('/app-debug', (req, res) => {
        res.sendFile(path.join(__dirname, 'app-debug.html'));
    });
}

app.get('/logo.png', (req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(path.join(__dirname, 'logo.png'));
});

// Keep SVG route for backward compatibility
app.get('/logo.svg', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(path.join(__dirname, 'logo.svg'));
});

// Serve static files explicitly for Vercel
app.get('/styles.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/globals.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'globals.css'));
});

app.get('/app.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/theme-switcher.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'theme-switcher.js'));
});

app.get('/app-premium.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'app-premium.js'));
});

// Debug JS files
if (process.env.NODE_ENV !== 'production') {
    app.get('/app-debug.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(path.join(__dirname, 'app-debug.js'));
    });
}

// API endpoints for profile management
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const profile = req.user.getProfile();
        // Include the showAIThoughts preference
        if (!profile.preferences) profile.preferences = {};
        profile.preferences.showAIThoughts = req.user.showAIThoughts || false;
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

app.post('/api/profile', verifyToken, async (req, res) => {
    try {
        await req.user.saveProfile(req.body);
        
        // Also save the showAIThoughts preference if provided
        if (req.body.preferences && req.body.preferences.showAIThoughts !== undefined) {
            req.user.showAIThoughts = req.body.preferences.showAIThoughts;
            await req.user.save();
        }
        
        res.json({ success: true, message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Save profile error:', error);
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// Load text models from env or use defaults
const TEXT_MODEL = process.env.TEXT_MODEL || 'llama-3.2-3b';
const DETAILED_TEXT_MODEL = process.env.DETAILED_TEXT_MODEL || 'llama-3.2-3b';

// Load vision models from env or use defaults
const VISION_MODELS = process.env.VISION_MODELS 
    ? process.env.VISION_MODELS.split(',').map(m => m.trim())
    : [
        'llama-3.2-11b-vision-instruct',  // Smallest/fastest vision model
        'mistral-31-24b',
        'llama-3.2-90b-vision-instruct'
    ];

// API endpoint for safety checks (1 free per day for trial/free users, unlimited for premium)
app.post('/api/check-safety', async (req, res) => {
    console.log('🔍 Safety check request received:', {
        item: req.body?.item,
        hasAuth: !!req.header('Authorization'),
        userAgent: req.header('User-Agent'),
        origin: req.header('Origin')
    });
    
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
            const cachedData = cached.data;

            // Enforce limits and track usage similarly to fresh calls
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
                const riskForHistory = cachedData.pregnancyRiskScore || cachedData.riskScore || 5;
                await user.addToHistory(item, riskForHistory);
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

            return res.json(cachedData);
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
        
        if (userProfile.allergies) {
            const activeAllergies = Object.entries(userProfile.allergies)
                .filter(([key, value]) => value === true)
                .map(([key, value]) => {
                    const allergyMap = {
                        'peanuts': 'peanut allergy',
                        'tree-nuts': 'tree nut allergy',
                        'milk': 'milk/dairy allergy',
                        'eggs': 'egg allergy',
                        'soy': 'soy allergy',
                        'wheat': 'wheat allergy',
                        'shellfish': 'shellfish allergy',
                        'fish': 'fish allergy',
                        'sesame': 'sesame allergy',
                        'latex': 'latex allergy',
                        'penicillin': 'penicillin allergy',
                        'aspirin': 'aspirin/NSAID allergy',
                        'sulfa': 'sulfa drug allergy',
                        'iodine': 'iodine/contrast dye allergy',
                        'bee-stings': 'bee/wasp sting allergy',
                        'pollen': 'pollen/hay fever',
                        'dust-mites': 'dust mite allergy',
                        'pet-dander': 'pet dander allergy',
                        'mold': 'mold allergy',
                        'nickel': 'nickel/metal allergy'
                    };
                    return allergyMap[key] || key;
                });
            if (activeAllergies.length > 0) {
                contextInfo += `\nPatient has allergies: ${activeAllergies.join(', ')}.`;
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
            model: TEXT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are a medical expert specializing in pregnancy safety. CRITICAL: Accurately assess risk levels.
                    
Risk Score Guidelines (1-10 scale):
- 1-2: Very safe (e.g., walking, prenatal vitamins)
- 3-4: Generally safe (e.g., moderate exercise, most cooked foods)
- 5: Requires judgment (e.g., hair dye, hot baths)
- 6-7: Use caution (e.g., some medications, certain exercises)
- 8-9: High risk/Avoid (e.g., raw fish/sushi, soft cheeses, roller coasters, alcohol)
- 10: Extremely dangerous (e.g., certain drugs, extreme activities)

Common high-risk items (7-9): sushi, raw fish, soft unpasteurized cheese, deli meats, roller coasters, hot tubs, alcohol, smoking.
Be accurate and evidence-based. Consider patient-specific conditions.`
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
        
        // Clean the AI response to remove thinking process
        const cleaned = cleanAIResponse(aiResponse);
        
        // Parse risk scores for either single or dual format
        let responseData;
        if (includeBreastfeeding) {
            const pregMatch = cleaned.response.match(/PREGNANCY_RISK_SCORE:\s*(\d+)/i);
            const bfMatch = cleaned.response.match(/BREASTFEEDING_RISK_SCORE:\s*(\d+)/i);
            const pregnancyRiskScore = pregMatch ? parseInt(pregMatch[1]) : 5;
            const breastfeedingRiskScore = bfMatch ? parseInt(bfMatch[1]) : null;
            responseData = {
                result: cleaned.response,
                hasBothSections: true,
                pregnancyRiskScore,
                breastfeedingRiskScore,
                references,
                thinking: cleaned.thinking,
                hasThinking: cleaned.hasThinking,
                showAIThoughts: user?.showAIThoughts || false
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

        const riskScoreMatch = cleaned.response.match(/RISK_SCORE:\s*(\d+)/);
        const riskScore = riskScoreMatch ? parseInt(riskScoreMatch[1]) : 5;
        
        const references = [
            { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
            { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
            { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
        ];
        
        responseData = { 
            result: cleaned.response,
            riskScore: riskScore,
            references: references,
            thinking: cleaned.thinking,
            hasThinking: cleaned.hasThinking,
            showAIThoughts: user?.showAIThoughts || false
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
        console.error('❌ Safety check error occurred:');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        if (error.response) {
            console.error('API Response status:', error.response.status);
            console.error('API Response data:', error.response.data);
        }
        
        // Provide a fallback response instead of 500 error for better UX
        const fallbackResponse = {
            result: `RISK_SCORE: 5\nSAFETY: Caution\nWHY: Unable to analyze "${req.body?.item || 'this item'}" right now due to a temporary service issue.\nTIPS: Please try again in a moment, consult your healthcare provider for specific guidance, and err on the side of caution.`,
            riskScore: 5,
            references: [
                { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
                { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
                { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
            ]
        };
        
        res.json(fallbackResponse);
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

        let lastError = null;
        
        for (const modelName of VISION_MODELS) {
            try {
                console.log(`🔍 Attempting image analysis with model: ${modelName}`);
                
                const requestBody = {
                    model: modelName,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a medical expert analyzing images for pregnancy safety. Look at the image carefully, identify what you see, and provide a specific safety assessment.

CRITICAL Risk Score Guidelines (1-10):
- 1-2: Very safe (walking, prenatal vitamins, fruits)
- 3-4: Generally safe (moderate exercise, most cooked foods)
- 5: Requires judgment (hair dye, hot baths)
- 6-7: Use caution (some medications, certain exercises)
- 8-9: High risk/Avoid (raw fish/sushi, soft cheeses, roller coasters, alcohol)
- 10: Extremely dangerous (certain drugs, extreme activities)

Common high-risk items (7-9): sushi, raw fish, soft unpasteurized cheese, deli meats, roller coasters, hot tubs, alcohol, smoking.
Be accurate based on what you see in the image.`
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Look at this image carefully. Identify what item, food, product, or activity is shown. Then assess its safety during pregnancy.

Respond in this exact format:
RISK_SCORE: [1-10]
SAFETY: [Safe/Caution/Avoid]
WHY: [Brief description of what you see in the image and specific explanation of why it's safe/caution/avoid for pregnancy]
TIPS:
- [Specific practical tip 1 based on what's in the image]
- [Specific practical tip 2 based on what's in the image]`
                                },
                                {
                                    type: 'image_url',
                                    image_url: { url: image }
                                }
                            ]
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 300
                };

                const response = await axios.post(apiUrl, requestBody, {
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
            } catch (modelError) {
                console.error(`❌ Model ${modelName} failed:`, modelError.response?.data || modelError.message);
                lastError = modelError;
                // Continue to next model
            }
        }
        
        // All vision models failed — return a graceful fallback instead of 500
        console.error('❌ All vision models failed. Returning graceful fallback. Last error:', lastError?.response?.data || lastError?.message);
        const helpfulResponse = `RISK_SCORE: 5
SAFETY: Caution
WHY: We couldn't analyze this image right now. Please try another photo or type what you want to check.
TIPS:
- Use a clear, well-lit photo focusing on one item
- Or type the name of the item (e.g., "coffee", "sushi", "ibuprofen")
- Include brand/type when relevant`;

        const references = [
            { title: 'Mayo Clinic - Pregnancy Week by Week', url: 'https://www.mayoclinic.org/healthy-lifestyle/pregnancy-week-by-week/basics/pregnancy-week-by-week/hlv-20049471' },
            { title: 'American Pregnancy Association', url: 'https://americanpregnancy.org/healthy-pregnancy/' },
            { title: 'CDC - Pregnancy Safety', url: 'https://www.cdc.gov/pregnancy/index.html' }
        ];

        return res.json({ result: helpfulResponse, riskScore: 5, references });
    } catch (error) {
        console.error('Image analysis error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to analyze image. Please try again later.',
            details: error.response?.data?.error || error.message 
        });
    }
});

// Helper function to clean AI thinking process from responses
function cleanAIResponse(rawResponse) {
    // Check if response contains thinking/reasoning patterns
    const thinkingPatterns = [
        /^\s*We are starting with.*?$/ms,
        /^\s*First,? I.*?$/gm,
        /^\s*I need to.*?$/gm,
        /^\s*Let me.*?$/gm,
        /^\s*Now,? I.*?$/gm,
        /^\s*Important:.*?$/gm,
        /^\s*Note:.*?about.*?$/gm,
        /^\s*We must.*?$/gm,
        /^\s*We are to.*?$/gm,
        /^\s*Let's structure.*?$/gm,
        /^\s*\d+\.\s+[A-Z][^:]+:.*?$/gm
    ];
    
    let cleanedResponse = rawResponse;
    let thinking = '';
    
    // Try to detect if there's a clear separation between thinking and actual response
    // Look for RISK_SCORE as the start of the actual response
    const riskScoreIndex = rawResponse.search(/^RISK_SCORE:\s*\d+/m);
    
    if (riskScoreIndex > 0) {
        // Check if there's substantial text before RISK_SCORE that looks like thinking
        const beforeRiskScore = rawResponse.substring(0, riskScoreIndex);
        
        // If there's thinking-like content before RISK_SCORE, separate it
        if (beforeRiskScore.length > 30) {
            // Check if the text before RISK_SCORE contains thinking patterns
            const lowerBefore = beforeRiskScore.toLowerCase();
            const hasThinkingIndicators = 
                lowerBefore.includes('we are starting') ||
                lowerBefore.includes('let me') ||
                lowerBefore.includes('i need to') ||
                lowerBefore.includes('first, i') ||
                lowerBefore.includes('now, i') ||
                lowerBefore.includes('we must') ||
                lowerBefore.includes('we are to') ||
                lowerBefore.includes("let's") ||
                lowerBefore.includes('important:') ||
                lowerBefore.includes('note:');
            
            if (hasThinkingIndicators) {
                thinking = beforeRiskScore.trim();
                cleanedResponse = rawResponse.substring(riskScoreIndex);
            }
        }
    }
    
    // Additional cleanup: Remove any inline thinking patterns that might remain
    for (const pattern of thinkingPatterns) {
        cleanedResponse = cleanedResponse.replace(pattern, '');
    }
    
    // Remove excessive blank lines
    cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
    
    return {
        response: cleanedResponse.trim(),
        thinking: thinking,
        hasThinking: thinking.length > 0
    };
}

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
        
        if (userProfile.allergies) {
            const activeAllergies = Object.entries(userProfile.allergies)
                .filter(([key, value]) => value === true)
                .map(([key, value]) => {
                    const allergyMap = {
                        'peanuts': 'peanut allergy',
                        'tree-nuts': 'tree nut allergy',
                        'milk': 'milk/dairy allergy',
                        'eggs': 'egg allergy',
                        'soy': 'soy allergy',
                        'wheat': 'wheat allergy',
                        'shellfish': 'shellfish allergy',
                        'fish': 'fish allergy',
                        'sesame': 'sesame allergy',
                        'latex': 'latex allergy',
                        'penicillin': 'penicillin allergy',
                        'aspirin': 'aspirin/NSAID allergy',
                        'sulfa': 'sulfa drug allergy',
                        'iodine': 'iodine/contrast dye allergy',
                        'bee-stings': 'bee/wasp sting allergy',
                        'pollen': 'pollen/hay fever',
                        'dust-mites': 'dust mite allergy',
                        'pet-dander': 'pet dander allergy',
                        'mold': 'mold allergy',
                        'nickel': 'nickel/metal allergy'
                    };
                    return allergyMap[key] || key;
                });
            if (activeAllergies.length > 0) {
                contextInfo += `\nPatient has allergies: ${activeAllergies.join(', ')}.`;
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
Start your response with EXACTLY TWO header lines:
RISK_SCORE: [1-10]
SAFETY: [Safe/Caution/Avoid]

Then a blank line followed by the full answer formatted using ONLY HTML tags (h3, p, ul, li, strong). Do NOT use markdown symbols like *, **, or #.

Please provide a thorough examination including these HTML sections:

<h3>Safety Overview</h3>
<p>Detailed safety assessment and risk level</p>

<h3>Trimester Considerations</h3>
<p>How safety/recommendations change by trimester</p>

<h3>Dosage/Amount Guidelines</h3>
<p>Specific limits and recommendations if applicable</p>

<h3>Medical Mechanisms</h3>
<p>How this affects pregnancy and fetal development</p>

<h3>Special Circumstances</h3>
<p>Considerations for high-risk pregnancies or specific conditions</p>

<h3>Practical Guidelines</h3>
<ul><li>Detailed practical advice and alternatives</li></ul>

<h3>Warning Signs</h3>
<ul><li>What symptoms to watch for</li></ul>

<h3>Healthcare Consultation</h3>
<p>When to contact healthcare providers</p>

Be comprehensive and evidence-based. Address any specific conditions mentioned.`;

        const apiUrl = 'https://api.venice.ai/api/v1/chat/completions';
        const requestBody = {
            model: DETAILED_TEXT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are a comprehensive pregnancy health expert providing detailed, evidence-based information. 

CRITICAL Risk Score Guidelines (1-10):
- 1-2: Very safe (walking, prenatal vitamins)
- 3-4: Generally safe (moderate exercise, most cooked foods)
- 5: Requires judgment (hair dye, hot baths)
- 6-7: Use caution (some medications, certain exercises)
- 8-9: High risk/Avoid (raw fish/sushi, soft cheeses, roller coasters, alcohol)
- 10: Extremely dangerous (certain drugs, extreme activities)

Common high-risk items (7-9): sushi, raw fish, soft unpasteurized cheese, deli meats, roller coasters, hot tubs, alcohol, smoking.

Give thorough, well-structured responses with specific medical guidance. Do NOT include ANY instructions, reasoning, formatting notes, or meta-commentary in your output. Start DIRECTLY with the two header lines, followed by a blank line, then ONLY the HTML-formatted content using h3, p, ul, li, strong tags. Do NOT use markdown or any other text.`
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
            },
            timeout: 45000, // 45 second timeout to prevent gateway errors
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });
        
        // Check if the response was successful
        if (response.status !== 200) {
            throw new Error(`Venice API returned status ${response.status}`);
        }
        
        // Validate the response structure
        if (!response.data || !response.data.choices || !response.data.choices[0]) {
            throw new Error('Invalid response structure from Venice API');
        }

        const aiResponse = response.data.choices[0].message.content;
        
        // Validate AI response exists
        if (!aiResponse) {
            throw new Error('Empty response from Venice API');
        }
        
        // Clean the AI response to remove thinking process
        let cleaned;
        try {
            cleaned = cleanAIResponse(aiResponse);
        } catch (cleanError) {
            console.error('Error cleaning AI response:', cleanError);
            // Fallback to uncleaned response
            cleaned = {
                response: aiResponse,
                thinking: '',
                hasThinking: false
            };
        }
        
        // Extract risk score for UI meter if present
        const riskMatch = cleaned.response.match(/RISK_SCORE:\s*(\d+)/i);
        const riskScore = riskMatch ? parseInt(riskMatch[1]) : 5;
        
        res.json({ 
            result: cleaned.response,
            riskScore,
            // Include thinking based on user preference
            thinking: cleaned.thinking,
            hasThinking: cleaned.hasThinking,
            showAIThoughts: user?.showAIThoughts || false
        });
    } catch (error) {
        console.error('Venice AI detailed API error:', error.response?.data || error.message);
        
        // Always ensure we return valid JSON
        res.setHeader('Content-Type', 'application/json');
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            return res.status(504).json({ 
                error: 'Request timed out',
                message: 'The analysis is taking longer than expected. Please try again or simplify your query.',
                isTimeout: true
            });
        }
        
        // Check if Venice API returned an error
        if (error.response?.status === 429) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'Too many requests. Please wait a moment and try again.',
                retryAfter: error.response?.headers?.['retry-after'] || 60
            });
        }
        
        if (error.response?.status >= 500) {
            return res.status(502).json({
                error: 'External service error',
                message: 'The AI service is temporarily unavailable. Please try again in a few moments.',
                details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
            });
        }
        
        // Default error response
        return res.status(500).json({ 
            error: 'Failed to get detailed information',
            message: 'An unexpected error occurred. Please try again.',
            details: process.env.NODE_ENV === 'development' ? (error.response?.data?.error || error.message) : undefined
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
        
        let lastError = null;
        
        for (const modelName of VISION_MODELS) {
            try {
                console.log(`🔍 Attempting detailed image analysis with model: ${modelName}`);
                
                const requestBody = {
                    model: modelName,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a comprehensive medical expert analyzing images for detailed pregnancy safety assessment. First identify what you see in the image, then provide thorough, evidence-based analysis.

CRITICAL Risk Score Guidelines (1-10):
- 1-2: Very safe (walking, prenatal vitamins, fruits)
- 3-4: Generally safe (moderate exercise, most cooked foods)
- 5: Requires judgment (hair dye, hot baths)
- 6-7: Use caution (some medications, certain exercises)
- 8-9: High risk/Avoid (raw fish/sushi, soft cheeses, roller coasters, alcohol)
- 10: Extremely dangerous (certain drugs, extreme activities)

Common high-risk items (7-9): sushi, raw fish, soft unpasteurized cheese, deli meats, roller coasters, hot tubs, alcohol, smoking.

Format your response using HTML tags only (h3, p, ul, li, strong) - do NOT use markdown (no *, #, or ** symbols).`
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Look at this image carefully and identify what is shown. Then provide a comprehensive analysis regarding pregnancy safety. ${contextInfo}

Format your response using HTML tags. Include these sections:

<h3>Item Identification</h3>
<p>What you see in the image</p>

<h3>Detailed Safety Assessment</h3>
<p>Comprehensive safety evaluation</p>

<h3>Specific Risks/Benefits</h3>
<p>Detailed explanation of any risks or benefits</p>

<h3>Trimester Considerations</h3>
<p>How recommendations might vary by pregnancy stage</p>

<h3>Usage Guidelines</h3>
<ul>
<li>Specific recommendations for safe use if applicable</li>
</ul>

<h3>Alternatives</h3>
<p>Safer alternatives if the item should be avoided</p>

<h3>Medical Considerations</h3>
<p>How this relates to pregnancy health</p>

<h3>When to Consult a Doctor</h3>
<ul>
<li>Specific situations requiring medical consultation</li>
</ul>

Be thorough and evidence-based. Use ONLY HTML tags (h3, p, ul, li, strong). Do NOT use markdown symbols like *, **, or #.`
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
                    max_tokens: 800
                };
                
                const response = await axios.post(apiUrl, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                console.log(`✅ Detailed image analysis successful with model: ${modelName}`);
                const aiResponse = response.data.choices[0].message.content;
                
                return res.json({ 
                    result: aiResponse
                });
            } catch (modelError) {
                console.error(`❌ Detailed model ${modelName} failed:`, modelError.response?.data || modelError.message);
                lastError = modelError;
                // Continue to next model
            }
        }
        
        // All vision models failed
        console.error('❌ All detailed vision models failed. Last error:', lastError?.response?.data || lastError?.message);
        throw lastError || new Error('All vision models failed');
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

// Global error handler middleware (must be last)
app.use((err, req, res, next) => {
    console.error('Global error handler caught:', err.stack || err);
    
    // Send appropriate error response
    if (res.headersSent) {
        return next(err);
    }
    
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(err.status || 500).json({
        error: isDevelopment ? err.message : 'An error occurred processing your request',
        ...(isDevelopment && { stack: err.stack }),
        message: 'The server encountered an error. Please try again later.'
    });
});

// Handle 404s
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
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