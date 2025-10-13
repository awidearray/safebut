const express = require('express');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get user's affiliate stats
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('referrals.userId', 'name email isPremium')
            .select('affiliateCode affiliatePoints referrals isPremium');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Generate affiliate code for premium users if they don't have one
        if (user.isPremium && !user.affiliateCode) {
            user.generateAffiliateCode();
            await user.save();
        }
        
        // Calculate stats
        const stats = {
            affiliateCode: user.isPremium ? user.affiliateCode : null,
            totalPoints: user.affiliatePoints || 0,
            totalReferrals: user.referrals.length,
            premiumReferrals: user.referrals.filter(r => r.isPremium).length,
            referrals: user.referrals.map(r => ({
                email: r.email,
                signupDate: r.signupDate,
                pointsAwarded: r.pointsAwarded,
                isPremium: r.isPremium
            })),
            canRefer: user.isPremium
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Get affiliate stats error:', error);
        res.status(500).json({ error: 'Failed to get affiliate stats' });
    }
});

// Generate affiliate link
router.post('/generate-link', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (!user.isPremium) {
            return res.status(403).json({ error: 'Affiliate program is only available to premium users' });
        }
        
        // Generate affiliate code if user doesn't have one
        if (!user.affiliateCode) {
            user.generateAffiliateCode();
            await user.save();
        }
        
        // Generate affiliate link
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const affiliateLink = `${baseUrl}/login?ref=${user.affiliateCode}`;
        
        res.json({
            affiliateCode: user.affiliateCode,
            affiliateLink: affiliateLink,
            totalPoints: user.affiliatePoints || 0
        });
    } catch (error) {
        console.error('Generate affiliate link error:', error);
        res.status(500).json({ error: 'Failed to generate affiliate link' });
    }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        // Get top users by affiliate points (premium users only)
        const leaderboard = await User.find({
            isPremium: true,
            affiliatePoints: { $gt: 0 }
        })
        .select('name email affiliatePoints referrals')
        .sort({ affiliatePoints: -1 })
        .limit(limit);
        
        const formattedLeaderboard = leaderboard.map((user, index) => ({
            rank: index + 1,
            name: user.name,
            email: user.email.replace(/(.{2}).*@/, '$1***@'), // Partially hide email
            points: user.affiliatePoints,
            referralCount: user.referrals ? user.referrals.length : 0
        }));
        
        res.json({
            leaderboard: formattedLeaderboard,
            totalUsers: formattedLeaderboard.length
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Award bonus points (premium upgrade bonus)
router.post('/award-premium-bonus', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if user was referred and the referrer should get bonus
        if (user.referredBy && user.isPremium) {
            const referrer = await User.findOne({ affiliateCode: user.referredBy });
            if (referrer) {
                // Award bonus points for premium upgrade (50 points)
                await referrer.awardReferralPoints(50);
                
                // Update the referral record to mark as premium
                const referralIndex = referrer.referrals.findIndex(r => r.userId.toString() === user._id.toString());
                if (referralIndex !== -1) {
                    referrer.referrals[referralIndex].isPremium = true;
                    referrer.referrals[referralIndex].pointsAwarded += 50;
                    await referrer.save();
                }
                
                console.log(`Premium bonus awarded: ${referrer.email} got 50 points for ${user.email} upgrading`);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Award premium bonus error:', error);
        res.status(500).json({ error: 'Failed to award premium bonus' });
    }
});

module.exports = router;