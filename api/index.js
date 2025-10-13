// Vercel serverless function handler
const app = require('../server-production');

// Export the Express app as a serverless function
module.exports = app;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});