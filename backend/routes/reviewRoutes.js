const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get reviews for a product
// @route   GET /api/reviews/product/:productId
router.get('/product/:productId', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sort = req.query.sort === 'oldest' ? 'createdAt' : '-createdAt';

    const [reviews, total] = await Promise.all([
      Review.find({ product: req.params.productId })
        .populate('user', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ product: req.params.productId }),
    ]);

    // Rating distribution
    const distribution = await Review.aggregate([
      { $match: { product: require('mongoose').Types.ObjectId.createFromHexString(req.params.productId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    distribution.forEach(d => { ratingDist[d._id] = d.count; });

    res.json({
      success: true, data: reviews,
      ratingDistribution: ratingDist,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Add review
// @route   POST /api/reviews
router.post('/', protect, async (req, res) => {
  try {
    const { productId, rating, title, comment } = req.body;

    // Check if user already reviewed
    const existing = await Review.findOne({ product: productId, user: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    // Check verified purchase
    const hasPurchased = await Order.findOne({
      user: req.user._id,
      'items.product': productId,
      orderStatus: 'delivered',
    });

    const review = await Review.create({
      product: productId,
      user: req.user._id,
      rating, title, comment,
      isVerifiedPurchase: !!hasPurchased,
    });

    await review.populate('user', 'name');
    res.status(201).json({ success: true, message: 'Review added', data: review });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Update review
// @route   PUT /api/reviews/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const { rating, title, comment } = req.body;
    if (rating) review.rating = rating;
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    await review.save();

    res.json({ success: true, message: 'Review updated', data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Delete review
// @route   DELETE /api/reviews/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const review = await Review.findOneAndDelete(filter);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    res.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get my reviews
// @route   GET /api/reviews/my
router.get('/my', protect, async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate('product', 'name slug images price')
      .sort('-createdAt');

    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
