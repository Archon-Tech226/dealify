const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    shortDescription: {
      type: String,
      maxlength: [300, 'Short description cannot exceed 300 characters'],
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    mrp: {
      type: Number,
      required: [true, 'MRP is required'],
      min: [0, 'MRP cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller is required'],
    },
    sellerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, default: '' },
        alt: { type: String, default: '' },
      },
    ],
    specifications: [
      {
        key: { type: String },
        value: { type: String },
      },
    ],
    variants: [
      {
        name: { type: String },
        options: [String],
      },
    ],
    sizes: [String],
    colors: [
      {
        name: { type: String },
        hex: { type: String },
      },
    ],
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    sku: {
      type: String,
      default: '',
    },
    weight: {
      type: Number,
      default: 0,
    },
    tags: [String],
    brand: {
      type: String,
      default: '',
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
    totalSold: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    shippingInfo: {
      freeShipping: { type: Boolean, default: false },
      shippingCost: { type: Number, default: 0 },
      estimatedDays: { type: Number, default: 5 },
    },
    returnPolicy: {
      returnable: { type: Boolean, default: true },
      returnDays: { type: Number, default: 7 },
    },
  },
  { timestamps: true }
);

// Text index for search
productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ seller: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ slug: 1 });

// Auto-generate slug and discount before saving
productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Date.now().toString(36);
  }
  // Calculate discount percentage
  if (this.mrp > 0 && this.price < this.mrp) {
    this.discount = Math.round(((this.mrp - this.price) / this.mrp) * 100);
  } else {
    this.discount = 0;
  }
  // Auto short description
  if (!this.shortDescription && this.description) {
    this.shortDescription = this.description.substring(0, 200);
  }
  next();
});

// Virtual: is in stock
productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
