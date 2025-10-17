// Vercel serverless function handler with enhanced error handling

// Set VERCEL environment variable to prevent server from starting
process.env.VERCEL = '1';

// Set NODE_ENV to production if not set
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
}

let app;

try {
    // Log environment info for debugging
    console.log('Vercel Function Starting:', {
        NODE_ENV: process.env.NODE_ENV,
        hasMongoUri: !!(process.env.MONGODB_URI || process.env.mongodb_uri),
        hasSessionSecret: !!process.env.SESSION_SECRET,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasVeniceKey: !!process.env.VENICE_API_KEY,
        functionTimeout: process.env.FUNCTION_TIMEOUT || '30s',
        vercelEnv: process.env.VERCEL
    });

    // Ensure critical environment variables have defaults for initialization
    if (!process.env.SESSION_SECRET) {
        console.warn('SESSION_SECRET not set, using default (not secure for production)');
        process.env.SESSION_SECRET = 'temporary-secret-for-initialization';
    }
    
    if (!process.env.JWT_SECRET) {
        console.warn('JWT_SECRET not set, using default (not secure for production)');
        process.env.JWT_SECRET = 'temporary-jwt-secret';
    }

    app = require('../server-production');
    
    if (!app) {
        throw new Error('Server-production did not export an app');
    }
} catch (error) {
    console.error('Failed to initialize server:', error);
    console.error('Stack trace:', error.stack);
    
    // Create a minimal error response app
    const express = require('express');
    app = express();
    
    app.use((req, res) => {
        const errorResponse = {
            error: 'Server initialization failed',
            message: 'The application failed to start properly.',
            timestamp: new Date().toISOString(),
            path: req.path
        };
        
        // In development or with specific header, show more details
        if (process.env.NODE_ENV === 'development' || req.headers['x-debug'] === 'true') {
            errorResponse.details = error.message;
            errorResponse.stack = error.stack;
            errorResponse.env = {
                hasMongoUri: !!(process.env.MONGODB_URI || process.env.mongodb_uri),
                hasSessionSecret: !!process.env.SESSION_SECRET,
                hasJwtSecret: !!process.env.JWT_SECRET,
                hasVeniceKey: !!process.env.VENICE_API_KEY
            };
        }
        
        res.status(500).json(errorResponse);
    });
}

// Export the Express app as a serverless function
module.exports = app;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Don't exit in serverless environment
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    // Don't exit in serverless environment
});