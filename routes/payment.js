const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get Stripe configuration
router.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        isTestMode: process.env.STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_') : true
    });
});

// Create Stripe Checkout Session for tiered pricing
router.post('/create-checkout-session', verifyToken, async (req, res) => {
    try {
        if (req.user.isPremium) {
            return res.status(400).json({ error: 'Already a premium member' });
        }

        const { priceType } = req.body;

        // Define pricing options
        const pricingOptions = {
            monthly: {
                name: 'Safe Maternity Premium - Monthly',
                description: 'Monthly subscription to pregnancy safety checks',
                unit_amount: 2499, // €24.99 in cents
                mode: 'subscription',
                recurring: {
                    interval: 'month'
                },
                productType: 'monthly_subscription'
            },
            annual: {
                name: 'Safe Maternity Premium - Annual',
                description: 'Annual subscription to pregnancy safety checks (Save 17%)',
                unit_amount: 9999, // €99.99 in cents
                mode: 'subscription',
                recurring: {
                    interval: 'year'
                },
                productType: 'annual_subscription'
            },
            lifetime: {
                name: 'Safe Maternity Premium - Lifetime',
                description: 'Lifetime access to all premium features',
                unit_amount: 2499, // €24.99 in cents
                mode: 'payment',
                productType: 'lifetime_premium'
            }
        };

        const selectedPrice = pricingOptions[priceType] || pricingOptions.lifetime;

        // Create or get Stripe customer
        let customer;
        if (req.user.stripeCustomerId) {
            customer = await stripe.customers.retrieve(req.user.stripeCustomerId);
        } else {
            customer = await stripe.customers.create({
                email: req.user.email,
                name: req.user.name,
                metadata: {
                    userId: req.user._id.toString()
                }
            });
            req.user.stripeCustomerId = customer.id;
            await req.user.save();
        }

        // Build line items based on selected price
        const lineItems = [{
            price_data: {
                currency: 'eur',
                product_data: {
                    name: selectedPrice.name,
                    description: selectedPrice.description
                },
                unit_amount: selectedPrice.unit_amount,
                ...(selectedPrice.recurring && {
                    recurring: selectedPrice.recurring
                })
            },
            quantity: 1
        }];

        // Create Checkout Session
        const forwardedProto = req.headers['x-forwarded-proto'];
        const forwardedHost = req.headers['x-forwarded-host'];
        const effectiveProto = forwardedProto || req.protocol;
        const effectiveHost = forwardedHost || req.get('host');
        const computedAppUrl = `${effectiveProto}://${effectiveHost}`;
        const appUrl = process.env.APP_URL || computedAppUrl;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer: customer.id,
            line_items: lineItems,
            mode: selectedPrice.mode,
            success_url: `${appUrl}/app.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/app.html`,
            metadata: {
                userId: req.user._id.toString(),
                productType: selectedPrice.productType,
                priceType: priceType
            },
            ...(selectedPrice.mode === 'subscription' && {
                subscription_data: {
                    metadata: {
                        userId: req.user._id.toString(),
                        productType: selectedPrice.productType
                    }
                }
            })
        });

        res.json({
            sessionId: session.id,
            url: session.url,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Create payment intent for $0.99 lifetime subscription (alternate method)
router.post('/create-payment-intent', verifyToken, async (req, res) => {
    try {
        if (req.user.isPremium) {
            return res.status(400).json({ error: 'Already a premium member' });
        }

        // Create or get Stripe customer
        let customer;
        if (req.user.stripeCustomerId) {
            customer = await stripe.customers.retrieve(req.user.stripeCustomerId);
        } else {
            customer = await stripe.customers.create({
                email: req.user.email,
                name: req.user.name,
                metadata: {
                    userId: req.user._id.toString()
                }
            });
            req.user.stripeCustomerId = customer.id;
            await req.user.save();
        }

        // Create payment intent for $0.99
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 2499, // €24.99 in cents
            currency: 'usd',
            customer: customer.id,
            metadata: {
                userId: req.user._id.toString(),
                productType: 'lifetime_premium'
            },
            description: 'Safe Maternity? Lifetime Premium Access'
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});

// Confirm payment and activate premium
router.post('/confirm-payment', verifyToken, async (req, res) => {
    try {
        const { paymentIntentId } = req.body;

        // Verify payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not completed' });
        }

        if (paymentIntent.metadata.userId !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Payment mismatch' });
        }

        // Activate premium subscription
        req.user.isPremium = true;
        req.user.stripePaymentIntentId = paymentIntentId;
        req.user.subscriptionDate = new Date();
        await req.user.save();

        res.json({
            success: true,
            message: 'Premium activated successfully!',
            user: {
                isPremium: true,
                subscriptionDate: req.user.subscriptionDate
            }
        });
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: 'Failed to confirm payment' });
    }
});

// Verify checkout session after redirect and activate premium
router.post('/verify-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId required' });
        }

        // Retrieve the checkout session
        let session = null;
        try {
            session = await stripe.checkout.sessions.retrieve(sessionId);
        } catch (stripeErr) {
            console.error('Stripe retrieve session failed:', stripeErr?.message || stripeErr);
        }
        // If Stripe failed, optionally trust authenticated token fallback
        if (!session) {
            const headerToken = req.header('Authorization')?.replace('Bearer ', '');
            if (headerToken) {
                try {
                    const decoded = jwt.verify(headerToken, process.env.JWT_SECRET);
                    const user = await User.findById(decoded.userId);
                    if (user) {
                        user.isPremium = true;
                        user.subscriptionDate = new Date();
                        await user.save();
                        return res.json({ success: true, isPremium: true, fallback: true });
                    }
                } catch (jwtErr) {
                    console.error('JWT fallback failed:', jwtErr?.message || jwtErr);
                }
            }
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.status !== 'complete' && session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Payment not completed' });
        }

        // Resolve user: prefer metadata.userId, fallback to customer email
        let user = null;
        const userId = session.metadata?.userId;
        const customerEmail = session.customer_details?.email;

        if (userId) {
            user = await User.findById(userId);
        }
        if (!user && customerEmail) {
            user = await User.findOne({ email: customerEmail });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found for session' });
        }

        // Mark user premium
        user.isPremium = true;
        user.stripeSessionId = session.id;
        user.subscriptionDate = new Date();
        await user.save();

        res.json({ success: true, isPremium: true });
    } catch (error) {
        console.error('Verify session error:', error);
        res.status(500).json({ error: 'Failed to verify session' });
    }
});

// Stripe webhook for payment confirmation
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    // Log webhook attempt
    console.log('📨 Webhook received with signature:', sig ? 'Present' : 'Missing');

    try {
        let event;
        
        // If webhook secret is not configured, parse the raw event (for testing)
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            console.log('⚠️ WARNING: STRIPE_WEBHOOK_SECRET not configured - processing without verification');
            event = JSON.parse(req.body.toString());
        } else {
            // Verify webhook signature
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        }

        console.log('✅ Received Stripe webhook:', event.type);

        // Handle checkout session completion (for Stripe Checkout)
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            console.log('💳 Checkout session completed:', session.id);
            console.log('   Payment status:', session.payment_status);
            console.log('   Mode:', session.mode);
            
            const userId = session.metadata?.userId;
            const customerEmail = session.customer_details?.email || session.customer_email;
            const customerId = session.customer;
            
            console.log('   Session metadata:', JSON.stringify(session.metadata));
            console.log('   Customer ID:', customerId);
            console.log('   Customer email:', customerEmail);
            console.log('   User ID from metadata:', userId);
            
            let user = null;
            
            // Try multiple methods to find the user
            // 1. By userId from metadata
            if (userId && userId !== 'undefined' && userId !== 'null') {
                try {
                    user = await User.findById(userId);
                    if (user) {
                        console.log('   ✅ Found user by ID:', user.email);
                    }
                } catch (err) {
                    console.log('   ❌ Error finding user by ID:', err.message);
                }
            }
            
            // 2. By Stripe customer ID
            if (!user && customerId) {
                user = await User.findOne({ stripeCustomerId: customerId });
                if (user) {
                    console.log('   ✅ Found user by Stripe customer ID:', user.email);
                }
            }
            
            // 3. By email
            if (!user && customerEmail) {
                user = await User.findOne({ email: customerEmail.toLowerCase() });
                if (user) {
                    console.log('   ✅ Found user by email:', user.email);
                }
            }
            
            if (user) {
                // Always update premium status on successful payment
                const wasAlreadyPremium = user.isPremium;
                user.isPremium = true;
                user.stripeSessionId = session.id;
                user.subscriptionDate = new Date();
                
                // Store subscription details based on mode
                if (session.mode === 'subscription') {
                    user.subscriptionType = session.metadata?.priceType || 'subscription';
                    if (session.subscription) {
                        user.stripeSubscriptionId = session.subscription;
                    }
                } else {
                    user.subscriptionType = 'lifetime';
                }
                
                await user.save();
                
                if (wasAlreadyPremium) {
                    console.log(`   ℹ️ User ${user.email} was already premium - status refreshed`);
                } else {
                    console.log(`   🎉 PREMIUM ACTIVATED for ${user.email} (ID: ${user._id})`);
                }
            } else {
                console.error(`   ❌ ERROR: No user found for payment!`);
                console.error(`      - Tried userId: ${userId}`);
                console.error(`      - Tried customerId: ${customerId}`);
                console.error(`      - Tried email: ${customerEmail}`);
                // Log this critical error for investigation
                console.error('   CRITICAL: Payment received but user not found!', {
                    sessionId: session.id,
                    metadata: session.metadata,
                    customerEmail,
                    customerId
                });
            }
        }
        
        // Handle payment intent success (for direct payments)
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const userId = paymentIntent.metadata.userId;
            console.log('Payment intent succeeded for user:', userId);

            if (userId) {
                const user = await User.findById(userId);
                if (user && !user.isPremium) {
                    user.isPremium = true;
                    user.stripePaymentIntentId = paymentIntent.id;
                    user.subscriptionDate = new Date();
                    await user.save();
                    console.log(`🎉 Premium activated for user: ${user.email} (ID: ${user._id})`);
                }
            }
        }

        // Handle subscription created/updated
        if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
            const subscription = event.data.object;
            const userId = subscription.metadata?.userId;
            const customerId = subscription.customer;
            
            console.log('Subscription event:', event.type, 'for user:', userId);
            
            let user = null;
            
            // Find user by ID or Stripe customer ID
            if (userId) {
                user = await User.findById(userId);
            }
            
            if (!user && customerId) {
                user = await User.findOne({ stripeCustomerId: customerId });
            }
            
            if (user && subscription.status === 'active') {
                user.isPremium = true;
                user.stripeSubscriptionId = subscription.id;
                user.subscriptionDate = new Date();
                user.subscriptionType = subscription.items.data[0]?.price?.recurring?.interval || 'unknown';
                await user.save();
                console.log(`🎉 Subscription activated for user: ${user.email} (Type: ${user.subscriptionType})`);
            }
        }

        // Handle subscription cancelled
        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            
            const user = await User.findOne({ stripeCustomerId: customerId });
            if (user) {
                user.isPremium = false;
                user.subscriptionEndDate = new Date();
                await user.save();
                console.log(`⚠️ Subscription cancelled for user: ${user.email}`);
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).json({ error: 'Webhook error' });
    }
});

// Debug endpoint to check user's payment status
router.get('/debug-status/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            email: user.email,
            isPremium: user.isPremium,
            stripeCustomerId: user.stripeCustomerId,
            stripeSessionId: user.stripeSessionId,
            stripeSubscriptionId: user.stripeSubscriptionId,
            subscriptionType: user.subscriptionType,
            subscriptionDate: user.subscriptionDate,
            dailySearches: user.dailySearches,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        });
    } catch (error) {
        console.error('Debug status error:', error);
        res.status(500).json({ error: 'Failed to get user status' });
    }
});

// Manual premium activation (for development/testing)
router.post('/manual-activate', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }
        
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.isPremium) {
            return res.json({ message: 'User is already premium', user: { email: user.email, isPremium: user.isPremium } });
        }
        
        user.isPremium = true;
        user.subscriptionDate = new Date();
        await user.save();
        
        console.log(`🎉 Manually activated premium for user: ${user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Premium activated successfully!',
            user: { 
                email: user.email, 
                isPremium: user.isPremium,
                subscriptionDate: user.subscriptionDate
            }
        });
    } catch (error) {
        console.error('Manual activation error:', error);
        res.status(500).json({ error: 'Failed to activate premium' });
    }
});

module.exports = router;