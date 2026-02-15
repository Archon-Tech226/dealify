const express = require('express');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Create Razorpay order
// @route   POST /api/payments/create-order
// @access  Private (Buyer)
router.post('/create-order', protect, roleGuard('buyer'), async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this order' });
    }

    if (order.paymentInfo.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    if (order.paymentInfo.method !== 'razorpay') {
      return res.status(400).json({ success: false, message: 'Order payment method is not Razorpay' });
    }

    const options = {
      amount: Math.round(order.grandTotal * 100),
      currency: 'INR',
      receipt: `order_${orderId}`,
      notes: {
        orderId: String(orderId),
        userId: String(req.user._id),
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);

    order.paymentInfo.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
});

// @desc    Verify Razorpay payment
// @route   POST /api/payments/verify-payment
// @access  Private (Buyer)
router.post('/verify-payment', protect, roleGuard('buyer'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (order.paymentInfo.status === 'paid') {
      return res.json({ success: true, message: 'Payment already verified', data: order });
    }

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      order.paymentInfo.status = 'failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    let finalizedOrder = null;

    await session.withTransaction(async () => {
      const orderInSession = await Order.findOne({ _id: orderId, user: req.user._id }).session(session);
      if (!orderInSession) throw new Error('ORDER_NOT_FOUND');

      for (const item of orderInSession.items) {
        const updated = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, totalSold: item.quantity } },
          { session, new: true }
        );

        if (!updated) {
          throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
        }
      }

      const cart = await Cart.findOne({ user: req.user._id }).session(session);
      if (cart) {
        for (const orderItem of orderInSession.items) {
          const index = cart.items.findIndex((cartItem) => (
            cartItem.product.toString() === orderItem.product.toString()
            && (cartItem.size || '') === (orderItem.size || '')
            && (cartItem.color || '') === (orderItem.color || '')
          ));

          if (index >= 0) {
            if (cart.items[index].quantity <= orderItem.quantity) {
              cart.items.splice(index, 1);
            } else {
              cart.items[index].quantity -= orderItem.quantity;
            }
          }
        }

        await cart.save({ session });
      }

      orderInSession.paymentInfo.status = 'paid';
      orderInSession.paymentInfo.razorpayPaymentId = razorpayPaymentId;
      orderInSession.paymentInfo.paidAt = new Date();
      await orderInSession.save({ session });

      finalizedOrder = orderInSession;
    });

    res.json({ success: true, message: 'Payment verified successfully', data: finalizedOrder });
  } catch (error) {
    if (error.message && error.message.startsWith('INSUFFICIENT_STOCK:')) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for "${error.message.split(':')[1]}". Payment captured; contact support for refund.`,
      });
    }

    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  } finally {
    session.endSession();
  }
});

// @desc    Get Razorpay key
// @route   GET /api/payments/razorpay-key
// @access  Public
router.get('/razorpay-key', (req, res) => {
  res.json({ success: true, data: { keyId: process.env.RAZORPAY_KEY_ID || '' } });
});

module.exports = router;
