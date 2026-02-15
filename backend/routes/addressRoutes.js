const express = require('express');
const router = express.Router();
const Address = require('../models/Address');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get all addresses for user
// @route   GET /api/addresses
router.get('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort('-isDefault -createdAt');
    res.json({ success: true, data: addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Add new address
// @route   POST /api/addresses
router.post('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const { name, phone, addressLine1, addressLine2, city, state, pincode, landmark, type, isDefault } = req.body;

    // If first address, make it default
    const count = await Address.countDocuments({ user: req.user._id });

    const address = await Address.create({
      user: req.user._id,
      name, phone, addressLine1, addressLine2, city, state, pincode, landmark, type,
      isDefault: count === 0 ? true : isDefault || false,
    });

    res.status(201).json({ success: true, message: 'Address added', data: address });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Update address
// @route   PUT /api/addresses/:id
router.put('/:id', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    const allowed = ['name', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'landmark', 'type', 'isDefault'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) address[field] = req.body[field];
    });
    await address.save();

    res.json({ success: true, message: 'Address updated', data: address });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Delete address
// @route   DELETE /api/addresses/:id
router.delete('/:id', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    // If deleted was default, make another one default
    if (address.isDefault) {
      const next = await Address.findOne({ user: req.user._id });
      if (next) { next.isDefault = true; await next.save(); }
    }

    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
