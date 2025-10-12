const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Create Stripe Checkout Session for $0.99 lifetime subscription
router.post('/create-checkout-session', verifyToken, async (req, res) => {
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

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer: customer.id,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Safebut? Lifetime Premium Access',
                        description: 'Unlimited pregnancy safety checks forever'
                    },
                    unit_amount: 99 // $0.99 in cents
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${process.env.APP_URL}/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL}/upgrade`,
            metadata: {
                userId: req.user._id.toString(),
                productType: 'lifetime_premium'
            }
        });

        res.json({
            sessionId: session.id,
            url: session.url
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
            amount: 99, // $0.99 in cents
            currency: 'usd',
            customer: customer.id,
            metadata: {
                userId: req.user._id.toString(),
                productType: 'lifetime_premium'
            },
            description: 'Safebut? Lifetime Premium Access'
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

// Stripe webhook for payment confirmation
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const userId = paymentIntent.metadata.userId;

            if (userId) {
                const user = await User.findById(userId);
                if (user && !user.isPremium) {
                    user.isPremium = true;
                    user.stripePaymentIntentId = paymentIntent.id;
                    user.subscriptionDate = new Date();
                    await user.save();
                    console.log(`Premium activated for user ${userId}`);
                }
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).json({ error: 'Webhook error' });
    }
});

module.exports = router;