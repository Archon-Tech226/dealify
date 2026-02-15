const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// @desc    Create new order (place order)
// @route   POST /api/orders
router.post('/', protect, roleGuard('buyer'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { shippingAddress, paymentMethod = 'cod', couponCode, notes } = req.body;

    let createdOrder;

    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ user: req.user._id }).populate('items.product').session(session);
      if (!cart || cart.items.length === 0) {
        throw new Error('CART_EMPTY');
      }

      const orderItems = [];
      let subtotal = 0;
      let shippingCharge = 0;

      for (const item of cart.items) {
        const product = item.product;
        if (!product || !product.isActive) {
          throw new Error(`PRODUCT_UNAVAILABLE:${item.product?.name || 'unknown'}`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        if (!product.shippingInfo?.freeShipping) {
          shippingCharge += (product.shippingInfo?.shippingCost || 40) * item.quantity;
        }

        orderItems.push({
          product: product._id,
          seller: product.seller,
          name: product.name,
          image: product.images?.[0]?.url || '',
          price: product.price,
          mrp: product.mrp,
          quantity: item.quantity,
          size: item.size,
          color: item.color,
        });
      }

      let discount = 0;
      let couponApplied = '';
      if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).session(session);
        if (coupon) {
          const validity = coupon.isValid(req.user._id, subtotal);
          if (validity.valid) {
            discount = coupon.calculateDiscount(subtotal);
            couponApplied = coupon.code;
            coupon.usedCount += 1;
            coupon.usedBy.push(req.user._id);
            await coupon.save({ session });
          }
        }
      }

      if (subtotal >= 499) shippingCharge = 0;
      const grandTotal = subtotal + shippingCharge - discount;

      const created = await Order.create([
        {
          user: req.user._id,
          items: orderItems,
          shippingAddress,
          paymentInfo: {
            method: paymentMethod,
            status: 'pending',
          },
          subtotal,
          shippingCharge,
          discount,
          coupon: couponApplied,
          grandTotal,
          notes,
        },
      ], { session });
      createdOrder = created[0];

      for (const item of orderItems) {
        const updated = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, totalSold: item.quantity } },
          { session, new: true }
        );
        if (!updated) {
          throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
        }
      }

      cart.items = [];
      await cart.save({ session });
    });

    // Send email notification (non-blocking)
    try {
      const emailService = require('../services/emailService');
      emailService.sendOrderConfirmation(req.user, createdOrder);
    } catch (e) { }

    res.status(201).json({ success: true, message: 'Order placed successfully', data: createdOrder });
  } catch (error) {
    if (error.message === 'CART_EMPTY') {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    if (error.message.startsWith('PRODUCT_UNAVAILABLE:')) {
      return res.status(400).json({ success: false, message: `Product "${error.message.split(':')[1]}" is no longer available` });
    }
    if (error.message.startsWith('INSUFFICIENT_STOCK:')) {
      return res.status(400).json({ success: false, message: `Insufficient stock for "${error.message.split(':')[1]}"` });
    }
    console.error('Order create error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// @desc    Get my orders (buyer)
// @route   GET /api/orders/my
router.get('/my', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status && req.query.status !== 'all') {
      filter.orderStatus = req.query.status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('items.product', 'name slug images'),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Cancel order (buyer)
// @route   PUT /api/orders/:id/cancel
router.put('/:id/cancel', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (['delivered', 'cancelled'].includes(order.orderStatus)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this order' });
    }

    order.orderStatus = 'cancelled';
    order.items.forEach(item => { item.status = 'cancelled'; item.cancelledAt = new Date(); item.cancelReason = req.body.reason || 'Cancelled by buyer'; });
    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity, totalSold: -item.quantity } });
    }

    res.json({ success: true, message: 'Order cancelled', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get seller orders (items sold by this seller)
// @route   GET /api/orders/seller/orders
router.get('/seller/orders', protect, roleGuard('seller'), async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { 'items.seller': req.user._id };
    if (req.query.status && req.query.status !== 'all') {
      filter['items.status'] = req.query.status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort('-createdAt').skip(skip).limit(limit)
        .populate('user', 'name email')
        .populate('items.product', 'name slug images'),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Update order item status (seller)
// @route   PUT /api/orders/:orderId/item/:itemId/status
router.put('/:orderId/item/:itemId/status', protect, roleGuard('seller'), async (req, res) => {
  try {
    const { status, trackingId } = req.body;
    const allowedStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Order item not found' });
    if (item.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    item.status = status;
    if (trackingId) item.trackingId = trackingId;
    if (status === 'delivered') item.deliveredAt = new Date();

    // Update overall order status based on all items
    const allStatuses = order.items.map(i => i.status);
    if (allStatuses.every(s => s === 'delivered')) {
      order.orderStatus = 'delivered';
      if (order.paymentInfo.method === 'cod') {
        order.paymentInfo.status = 'paid';
        order.paymentInfo.paidAt = new Date();
      }
    } else if (allStatuses.every(s => s === 'cancelled')) {
      order.orderStatus = 'cancelled';
    } else if (allStatuses.some(s => s === 'shipped')) {
      order.orderStatus = 'shipped';
    } else if (allStatuses.some(s => s === 'confirmed')) {
      order.orderStatus = 'confirmed';
    }

    await order.save();
    res.json({ success: true, message: 'Status updated', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get all orders (admin)
// @route   GET /api/orders/admin/all
router.get('/admin/all', protect, roleGuard('admin'), async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.orderStatus = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { orderId: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort('-createdAt').skip(skip).limit(limit)
        .populate('user', 'name email')
        .populate('items.product', 'name slug images'),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get single order
// @route   GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name slug images')
      .populate('user', 'name email');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Check ownership (buyers see their own, sellers see orders with their items, admin sees all)
    if (req.user.role === 'buyer' && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'seller') {
      const hasSellerItem = order.items.some((item) => item.seller.toString() === req.user._id.toString());
      if (!hasSellerItem) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    if (req.user.role !== 'buyer' && req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
