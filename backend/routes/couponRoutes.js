const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Validate coupon (buyer)
// @route   POST /api/coupons/validate
router.post('/validate', protect, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });

    const validity = coupon.isValid(req.user._id, orderAmount);
    if (!validity.valid) return res.status(400).json({ success: false, message: validity.message });

    const discount = coupon.calculateDiscount(orderAmount);
    res.json({
      success: true,
      data: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        description: coupon.description,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get all coupons (admin)
// @route   GET /api/coupons
router.get('/', protect, roleGuard('admin'), async (req, res) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json({ success: true, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Create coupon (admin)
// @route   POST /api/coupons
router.post('/', protect, roleGuard('admin'), async (req, res) => {
  try {
    const allowed = ['code', 'description', 'type', 'value', 'minOrderAmount', 'maxDiscount', 'usageLimit', 'perUserLimit', 'validFrom', 'validTill', 'isActive', 'categories'];
    const payload = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    const coupon = await Coupon.create(payload);
    res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors || {})[0]?.message || 'Invalid coupon data';
      return res.status(400).json({ success: false, message });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Update coupon (admin)
// @route   PUT /api/coupons/:id
router.put('/:id', protect, roleGuard('admin'), async (req, res) => {
  try {
    const allowed = ['description', 'type', 'value', 'minOrderAmount', 'maxDiscount', 'usageLimit', 'perUserLimit', 'validFrom', 'validTill', 'isActive', 'categories'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon updated', data: coupon });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors || {})[0]?.message || 'Invalid coupon data';
      return res.status(400).json({ success: false, message });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Delete coupon (admin)
// @route   DELETE /api/coupons/:id
router.delete('/:id', protect, roleGuard('admin'), async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
