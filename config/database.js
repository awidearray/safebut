const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Check if MongoDB URI is provided
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI is not defined in environment variables');
            throw new Error('Database configuration missing');
        }

        // Skip connection in serverless environment if already connected
        if (mongoose.connection.readyState === 1) {
            console.log('Using existing MongoDB connection');
            return mongoose.connection;
        }

        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            bufferCommands: false,
            maxPoolSize: 10,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });

        // Don't exit process in serverless environment
        if (process.env.VERCEL !== '1') {
            process.on('SIGINT', async () => {
                await mongoose.connection.close();
                console.log('MongoDB connection closed through app termination');
                process.exit(0);
            });
        }

        return conn;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        // Don't exit process in serverless, throw error instead
        if (process.env.VERCEL === '1') {
            throw error;
        }
        process.exit(1);
    }
};

module.exports = connectDB;