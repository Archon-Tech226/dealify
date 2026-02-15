const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify connection on startup
transporter.verify().then(() => {
  logger.info('Email service ready');
}).catch((err) => {
  logger.warn(`Email service not configured: ${err.message}`);
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `Dealify <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Email send error: ${error.message}`);
  }
}

function sendPasswordResetEmail(user, resetToken) {
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#2563EB,#1D4ED8);padding:28px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">Reset Your Password</h1>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Use the token below to reset your password. This token is valid for 30 minutes.</p>
        <div style="padding:14px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:16px;font-weight:700;word-break:break-all;">${resetToken}</div>
        <p style="margin-top:16px;color:#6b7280;font-size:13px;">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  `;

  return sendEmail(user.email, 'Dealify Password Reset Token', html);
}

// ─── Email Templates ──────────────────────────────────────

function sendOrderConfirmation(user, order) {
  const itemsHTML = order.items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${item.price.toLocaleString('en-IN')}</td>
    </tr>
  `).join('');

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#8B5CF6,#6D28D9);padding:32px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">🎉 Order Confirmed!</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Thank you for shopping with Dealify</p>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Your order <strong>#${order.orderId}</strong> has been placed successfully.</p>
        
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="padding:10px;text-align:left;">Product</th>
              <th style="padding:10px;text-align:center;">Qty</th>
              <th style="padding:10px;text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>

        <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin-top:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><span>₹${order.subtotal.toLocaleString('en-IN')}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Shipping</span><span>${order.shippingCharge > 0 ? '₹' + order.shippingCharge : 'Free'}</span></div>
          ${order.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#16A34A;"><span>Discount</span><span>-₹${order.discount.toLocaleString('en-IN')}</span></div>` : ''}
          <hr style="border:none;border-top:1px solid #ddd;margin:8px 0;">
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1em;"><span>Total</span><span>₹${order.grandTotal.toLocaleString('en-IN')}</span></div>
        </div>

        <div style="margin-top:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
          <h3 style="margin:0 0 8px;font-size:14px;">📍 Shipping Address</h3>
          <p style="margin:0;font-size:14px;color:#555;">
            ${order.shippingAddress.name}<br>
            ${order.shippingAddress.addressLine1}${order.shippingAddress.addressLine2 ? ', ' + order.shippingAddress.addressLine2 : ''}<br>
            ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}
          </p>
        </div>

        <p style="margin-top:24px;font-size:14px;color:#666;">Payment: <strong>${order.paymentInfo.method.toUpperCase()}</strong></p>
        <p style="font-size:13px;color:#999;margin-top:24px;">If you have any questions, reply to this email. Happy shopping! 💜</p>
      </div>
    </div>
  `;

  return sendEmail(user.email, `Order Confirmed - #${order.orderId}`, html);
}

function sendWelcomeEmail(user) {
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#8B5CF6,#6D28D9);padding:32px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:28px;">Welcome to Dealify! 🛍️</h1>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Welcome to Dealify — your one-stop destination for amazing deals!</p>
        <p>Start exploring thousands of products at the best prices. Here's what you can do:</p>
        <ul>
          <li>🔍 Browse and search products</li>
          <li>❤️ Add to wishlist</li>
          <li>🛒 Add to cart and checkout</li>
          <li>📦 Track your orders</li>
          <li>⭐ Rate and review products</li>
        </ul>
        <p style="font-size:13px;color:#999;margin-top:24px;">Happy shopping! 💜<br>Team Dealify</p>
      </div>
    </div>
  `;
  return sendEmail(user.email, 'Welcome to Dealify! 🛍️', html);
}

function sendSellerApproval(user, approved) {
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:'Inter',Arial,sans-serif;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:${approved ? '#16A34A' : '#DC2626'};padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;">${approved ? '✅ Seller Account Approved!' : '❌ Seller Application Update'}</h1>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>${approved 
          ? 'Your seller account has been approved! You can now start listing products and selling on Dealify.'
          : 'Unfortunately, your seller application has been declined. Please contact support for more information.'
        }</p>
      </div>
    </div>
  `;
  return sendEmail(user.email, approved ? 'Seller Account Approved!' : 'Seller Application Update', html);
}

module.exports = { sendEmail, sendOrderConfirmation, sendWelcomeEmail, sendSellerApproval, sendPasswordResetEmail };
