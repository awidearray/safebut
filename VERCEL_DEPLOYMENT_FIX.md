# Vercel Deployment Fix

## Changes Made

1. **Updated `/api/index.js`**:
   - Added `VERCEL=1` environment variable to prevent server startup in serverless
   - Added default values for critical environment variables during initialization
   - Improved error handling and debugging information
   - Added better stack trace logging

2. **Updated `/server-production.js`**:
   - Improved database connection handling for serverless environment
   - Added `/api/health` endpoint for debugging
   - Fixed MongoDB connection to be lazy in serverless environment

## Required Environment Variables in Vercel

You need to add these environment variables in your Vercel project settings:

```bash
# Required
SESSION_SECRET=your-secure-random-string-here
JWT_SECRET=your-secure-jwt-secret-here
VENICE_API_KEY=your-venice-api-key-here

# Optional but recommended
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
NODE_ENV=production
```

## How to Fix the Deployment

1. **Add Environment Variables**:
   - Go to your Vercel project dashboard
   - Navigate to Settings → Environment Variables
   - Add all required environment variables listed above
   - Make sure to use secure, random values for SESSION_SECRET and JWT_SECRET

2. **Deploy the Changes**:
   ```bash
   git add .
   git commit -m "Fix Vercel serverless deployment"
   git push
   ```

3. **Test the Deployment**:
   - After deployment, visit `https://www.safe-maternity.com/api/health`
   - This should return a JSON with status information
   - Check if all config values show as `true`

4. **Debug if Still Failing**:
   - Check Vercel function logs for detailed error messages
   - The improved error handling will show more specific error details
   - Add `x-debug: true` header to requests to see more debugging info

## Common Issues and Solutions

### Issue: Function timeout
**Solution**: The function is configured with a 30-second timeout. If database connections are slow, consider using a connection pooling service.

### Issue: MongoDB connection fails
**Solution**: 
- Ensure MongoDB URI is correctly set in environment variables
- Make sure your MongoDB cluster allows connections from Vercel's IP addresses
- Consider using MongoDB Atlas with Network Access set to allow access from anywhere (0.0.0.0/0)

### Issue: Missing dependencies
**Solution**: Ensure all dependencies are in package.json and not in devDependencies

## Testing Locally

To test the serverless function locally:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally
vercel dev
```

This will simulate the Vercel environment locally.
