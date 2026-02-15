const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  storeName: {
    type: String,
    required: [true, 'Store name is required'],
    trim: true,
    minlength: [2, 'Store name must be at least 2 characters'],
    maxlength: [100, 'Store name cannot exceed 100 characters'],
  },
  storeDescription: {
    type: String,
    maxlength: [500, 'Store description cannot exceed 500 characters'],
    default: '',
  },
  storeLogo: {
    type: String,
    default: '',
  },
  phone: {
    type: String,
    default: '',
  },
  gstin: {
    type: String,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GSTIN'],
    default: '',
  },
  panNumber: {
    type: String,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Please enter a valid PAN number'],
    default: '',
  },
  bankDetails: {
    accountHolderName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    bankName: { type: String, default: '' },
  },
  businessAddress: {
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },
  documents: [{
    type: { type: String }, // 'gstin_cert', 'pan_card', 'address_proof'
    url: String,
    verified: { type: Boolean, default: false },
  }],
  isApproved: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvalNote: {
    type: String,
    default: '',
  },
  commissionRate: {
    type: Number,
    default: 10, // 10% default commission
    min: 0,
    max: 100,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  numReviews: {
    type: Number,
    default: 0,
  },
  totalProducts: {
    type: Number,
    default: 0,
  },
  totalOrders: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  shippingPolicy: {
    type: String,
    default: 'Standard shipping: 5-7 business days',
  },
  returnPolicy: {
    type: String,
    default: '7-day return policy',
  },
}, { timestamps: true });

module.exports = mongoose.model('Seller', sellerSchema);
