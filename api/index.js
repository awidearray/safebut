// Vercel serverless function handler with enhanced error handling
let app;

try {
    // Log environment info for debugging
    console.log('Vercel Function Starting:', {
        NODE_ENV: process.env.NODE_ENV,
        hasMongoUri: !!(process.env.MONGODB_URI || process.env.mongodb_uri),
        hasSessionSecret: !!process.env.SESSION_SECRET,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasVeniceKey: !!process.env.VENICE_API_KEY,
        functionTimeout: process.env.FUNCTION_TIMEOUT || '30s'
    });

    app = require('../server-production');
} catch (error) {
    console.error('Failed to initialize server:', error);
    
    // Create a minimal error response app
    const express = require('express');
    app = express();
    
    app.use((req, res) => {
        res.status(500).json({
            error: 'Server initialization failed',
            message: 'The application failed to start properly. Please check server logs.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Export the Express app as a serverless function
module.exports = app;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit in serverless environment
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    // Don't exit in serverless environment
});