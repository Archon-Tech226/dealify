const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // for percentage type
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    validFrom: { type: Date, default: Date.now },
    validTill: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }], // empty = all categories
  },
  { timestamps: true }
);

// Check if coupon is valid
couponSchema.methods.isValid = function (userId, orderAmount) {
  const now = new Date();
  if (!this.isActive) return { valid: false, message: 'Coupon is inactive' };
  if (now < this.validFrom) return { valid: false, message: 'Coupon not yet valid' };
  if (now > this.validTill) return { valid: false, message: 'Coupon has expired' };
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return { valid: false, message: 'Coupon usage limit reached' };
  if (orderAmount < this.minOrderAmount) return { valid: false, message: `Minimum order amount is ₹${this.minOrderAmount}` };
  
  // Check per-user limit
  const userUsage = this.usedBy.filter(id => id.toString() === userId.toString()).length;
  if (userUsage >= this.perUserLimit) return { valid: false, message: 'You have already used this coupon' };

  return { valid: true };
};

// Calculate discount
couponSchema.methods.calculateDiscount = function (orderAmount) {
  let discount = 0;
  if (this.type === 'percentage') {
    discount = (orderAmount * this.value) / 100;
    if (this.maxDiscount > 0) discount = Math.min(discount, this.maxDiscount);
  } else {
    discount = this.value;
  }
  return Math.min(discount, orderAmount);
};

module.exports = mongoose.model('Coupon', couponSchema);
