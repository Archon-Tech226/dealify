const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get admin dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
router.get('/dashboard', protect, roleGuard('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const Seller = require('../models/Seller');
    const Product = require('../models/Product');

    const totalBuyers = await User.countDocuments({ role: 'buyer' });
    const totalSellers = await User.countDocuments({ role: 'seller' });
    const pendingSellers = await Seller.countDocuments({ isApproved: 'pending' });
    const approvedSellers = await Seller.countDocuments({ isApproved: 'approved' });
    const totalProducts = await Product.countDocuments();
    const pendingProducts = await Product.countDocuments({ isApproved: 'pending' });

    // Try to get order stats if Order model exists
    let totalOrders = 0, totalRevenue = 0;
    try {
      const Order = require('../models/Order');
      totalOrders = await Order.countDocuments();
      const revenueAgg = await Order.aggregate([{ $match: { 'paymentInfo.status': 'paid' } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]);
      totalRevenue = revenueAgg[0]?.total || 0;
    } catch(e) { /* Order model not yet created */ }

    res.json({
      success: true,
      data: {
        totalBuyers,
        totalSellers,
        pendingSellers,
        approvedSellers,
        totalProducts,
        pendingProducts,
        totalOrders,
        totalRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
router.get('/users', protect, roleGuard('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const { role, search, page = 1, limit = 20 } = req.query;

    let query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: { users, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Block/Unblock user
// @route   PUT /api/admin/users/:id/block
// @access  Private (Admin only)
router.put('/users/:id/block', protect, roleGuard('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get all sellers (with approval status)
// @route   GET /api/admin/sellers
// @access  Private (Admin only)
router.get('/sellers', protect, roleGuard('admin'), async (req, res) => {
  try {
    const Seller = require('../models/Seller');
    const { status, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status) query.isApproved = status;

    const sellers = await Seller.find(query)
      .populate('userId', 'name email phone avatar isBlocked')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Seller.countDocuments(query);

    res.json({
      success: true,
      data: { sellers, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Approve/Reject seller
// @route   PUT /api/admin/sellers/:id/approve
// @access  Private (Admin only)
router.put('/sellers/:id/approve', protect, roleGuard('admin'), async (req, res) => {
  try {
    const Seller = require('../models/Seller');
    const { status, note } = req.body; // status: 'approved' or 'rejected'

    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    seller.isApproved = status;
    seller.approvalNote = note || '';
    await seller.save();

    res.json({
      success: true,
      message: `Seller ${status} successfully`,
      data: seller,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
