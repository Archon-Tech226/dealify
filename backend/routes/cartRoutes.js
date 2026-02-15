const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Get user's cart
// @route   GET /api/cart
router.get('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: 'items.product',
      select: 'name slug images price mrp stock isActive seller',
      populate: { path: 'seller', select: 'name' },
    });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    // Remove items where product was deleted or deactivated
    cart.items = cart.items.filter(item => item.product && item.product.isActive);
    await cart.save();

    res.json({ success: true, data: cart });
  } catch (error) {
    console.error('Cart GET error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Add item to cart
// @route   POST /api/cart
router.post('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const { productId, quantity = 1, size = '', color = '' } = req.body;

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Check if item already in cart
    const existingIdx = cart.items.findIndex(
      item => item.product.toString() === productId && item.size === size && item.color === color
    );

    if (existingIdx > -1) {
      cart.items[existingIdx].quantity += quantity;
      if (cart.items[existingIdx].quantity > product.stock) {
        cart.items[existingIdx].quantity = product.stock;
      }
    } else {
      cart.items.push({ product: productId, quantity, size, color, price: product.price, mrp: product.mrp });
    }

    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name slug images price mrp stock isActive seller' });

    res.json({ success: true, message: 'Added to cart', data: cart });
  } catch (error) {
    console.error('Cart POST error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
router.put('/:itemId', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    const product = await Product.findById(item.product);
    if (quantity > product.stock) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    item.quantity = quantity;
    item.price = product.price;
    item.mrp = product.mrp;
    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name slug images price mrp stock isActive seller' });

    res.json({ success: true, data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
router.delete('/:itemId', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.items = cart.items.filter(item => item._id.toString() !== req.params.itemId);
    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name slug images price mrp stock isActive seller' });

    res.json({ success: true, message: 'Item removed', data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Clear entire cart
// @route   DELETE /api/cart
router.delete('/', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    res.json({ success: true, message: 'Cart cleared', data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
