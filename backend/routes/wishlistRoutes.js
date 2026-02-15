const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get user's wishlist
// @route   GET /api/wishlist
router.get('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id }).populate({
      path: 'products',
      select: 'name slug images price mrp discount rating numReviews isActive',
    });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    // Remove deactivated products
    wishlist.products = wishlist.products.filter(p => p && p.isActive);
    await wishlist.save();

    res.json({ success: true, data: wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Add product to wishlist
// @route   POST /api/wishlist
router.post('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const { productId } = req.body;

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user._id, products: [] });
    }

    if (wishlist.products.includes(productId)) {
      return res.json({ success: true, message: 'Already in wishlist', data: wishlist });
    }

    wishlist.products.push(productId);
    await wishlist.save();
    await wishlist.populate({ path: 'products', select: 'name slug images price mrp discount rating numReviews isActive' });

    res.json({ success: true, message: 'Added to wishlist', data: wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Remove product from wishlist
// @route   DELETE /api/wishlist/:productId
router.delete('/:productId', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) return res.status(404).json({ success: false, message: 'Wishlist not found' });

    wishlist.products = wishlist.products.filter(id => id.toString() !== req.params.productId);
    await wishlist.save();
    await wishlist.populate({ path: 'products', select: 'name slug images price mrp discount rating numReviews isActive' });

    res.json({ success: true, message: 'Removed from wishlist', data: wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
