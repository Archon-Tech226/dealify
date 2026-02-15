const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get seller dashboard stats
// @route   GET /api/sellers/dashboard
// @access  Private (Seller only)
router.get('/dashboard', protect, roleGuard('seller'), async (req, res) => {
  try {
    const Seller = require('../models/Seller');
    const seller = await Seller.findOne({ userId: req.user._id });

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller profile not found' });
    }

    res.json({
      success: true,
      data: {
        storeName: seller.storeName,
        isApproved: seller.isApproved,
        totalProducts: seller.totalProducts,
        totalOrders: seller.totalOrders,
        totalEarnings: seller.totalEarnings,
        rating: seller.rating,
        numReviews: seller.numReviews,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get seller profile
// @route   GET /api/sellers/profile
// @access  Private (Seller only)
const getSellerProfile = async (req, res) => {
  try {
    const Seller = require('../models/Seller');
    const seller = await Seller.findOne({ userId: req.user._id });
    res.json({ success: true, data: seller });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
router.get('/profile', protect, roleGuard('seller'), getSellerProfile);
router.get('/me', protect, roleGuard('seller'), getSellerProfile); // alias for frontend

// @desc    Update seller profile
// @route   PUT /api/sellers/profile
// @access  Private (Seller only)
router.put('/profile', protect, roleGuard('seller'), async (req, res) => {
  try {
    const Seller = require('../models/Seller');
    // Whitelist allowed fields to prevent mass assignment
    const allowed = ['storeName', 'storeDescription', 'storeLogo', 'phone', 'gstin', 'panNumber', 'bankDetails', 'businessAddress', 'shippingPolicy', 'returnPolicy'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    const seller = await Seller.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: 'Profile updated', data: seller });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
