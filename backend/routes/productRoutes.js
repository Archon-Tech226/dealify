const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Seller = require('../models/Seller');

// ───────────────────────────────────────────────
// PUBLIC ROUTES
// ───────────────────────────────────────────────

// @desc    Get all approved products (public, with search/filter/sort/pagination)
// @route   GET /api/products
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sort = 'newest',
      brand,
      rating,
      featured,
      seller,
    } = req.query;

    const filter = { isActive: true, isApproved: 'approved' };

    // Category filter
    if (category) {
      const cat = await Category.findOne({ slug: category });
      if (cat) {
        // Include subcategories
        const subCats = await Category.find({ parent: cat._id }).select('_id');
        const catIds = [cat._id, ...subCats.map((s) => s._id)];
        filter.category = { $in: catIds };
      }
    }

    // Search
    if (search) {
      filter.$text = { $search: search };
    }

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Brand filter
    if (brand) {
      filter.brand = { $regex: new RegExp(brand, 'i') };
    }

    // Rating filter
    if (rating) {
      filter.rating = { $gte: Number(rating) };
    }

    // Featured filter
    if (featured === 'true') {
      filter.isFeatured = true;
    }

    // Seller filter
    if (seller) {
      filter.seller = seller;
    }

    // Sort options
    let sortOption = {};
    switch (sort) {
      case 'price_low':
        sortOption = { price: 1 };
        break;
      case 'price_high':
        sortOption = { price: -1 };
        break;
      case 'rating':
        sortOption = { rating: -1 };
        break;
      case 'popular':
        sortOption = { totalSold: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'newest':
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate('category', 'name slug icon')
      .populate('seller', 'name')
      .populate('sellerProfile', 'storeName rating')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .select('-specifications -variants -description');

    res.json({
      success: true,
      count: products.length,
      total,
      pages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: products,
    });
  } catch (error) {
    console.error('Product list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get featured products (MUST be before /slug/:slug to avoid matching 'featured' as slug)
// @route   GET /api/products/featured
router.get('/featured', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 8;
    const products = await Product.find({
      isActive: true,
      isApproved: 'approved',
      isFeatured: true,
    })
      .populate('category', 'name slug icon')
      .populate('seller', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-specifications -variants -description');

    res.json({ success: true, count: products.length, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get single product by slug (public)
// @route   GET /api/products/slug/:slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
      isApproved: 'approved',
    })
      .populate('category', 'name slug icon')
      .populate('seller', 'name')
      .populate('sellerProfile', 'storeName rating storeDescription shippingPolicy returnPolicy');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ───────────────────────────────────────────────
// SELLER ROUTES
// ───────────────────────────────────────────────

// @desc    Get seller's own products
// @route   GET /api/products/my-products
router.get('/my-products', protect, roleGuard('seller'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { seller: req.user._id };

    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'pending') filter.isApproved = 'pending';
    if (status === 'approved') filter.isApproved = 'approved';
    if (status === 'rejected') filter.isApproved = 'rejected';

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      count: products.length,
      total,
      pages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: products,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get one seller product by id (own only)
// @route   GET /api/products/my-products/:id
router.get('/my-products/:id', protect, roleGuard('seller'), async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user._id,
    }).populate('category', 'name slug');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Create a product (seller)
// @route   POST /api/products
router.post('/', protect, roleGuard('seller'), async (req, res) => {
  try {
    // Check if seller is approved
    const sellerProfile = await Seller.findOne({ userId: req.user._id });
    if (!sellerProfile || sellerProfile.isApproved !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account must be approved before adding products',
      });
    }

    const {
      name, description, shortDescription, price, mrp,
      category, images, specifications, variants, sizes,
      colors, stock, sku, weight, tags, brand,
      shippingInfo, returnPolicy,
    } = req.body;

    // Validations
    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price and category are required',
      });
    }

    // Verify category exists
    const cat = await Category.findById(category);
    if (!cat) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const product = await Product.create({
      name,
      description: description || '',
      shortDescription: shortDescription || '',
      price,
      mrp: mrp || price,
      category,
      seller: req.user._id,
      sellerProfile: sellerProfile._id,
      images: images || [],
      specifications: specifications || [],
      variants: variants || [],
      sizes: sizes || [],
      colors: colors || [],
      stock: stock || 0,
      sku: sku || '',
      weight: weight || 0,
      tags: tags || [],
      brand: brand || '',
      shippingInfo: shippingInfo || {},
      returnPolicy: returnPolicy || {},
    });

    // Update counts
    await Category.findByIdAndUpdate(category, { $inc: { productCount: 1 } });
    await Seller.findByIdAndUpdate(sellerProfile._id, { $inc: { totalProducts: 1 } });

    res.status(201).json({ success: true, message: 'Product created and pending approval', data: product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @desc    Update product (seller - own only)
// @route   PUT /api/products/:id
router.put('/:id', protect, roleGuard('seller'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const allowedFields = [
      'name', 'description', 'shortDescription', 'price', 'mrp',
      'images', 'specifications', 'variants', 'sizes', 'colors',
      'stock', 'sku', 'weight', 'tags', 'brand', 'isActive',
      'shippingInfo', 'returnPolicy',
    ];

    const oldCategory = product.category;
    let categoryChanged = false;

    // Handle category change
    if (req.body.category && req.body.category !== product.category.toString()) {
      const newCat = await Category.findById(req.body.category);
      if (!newCat) {
        return res.status(400).json({ success: false, message: 'Invalid category' });
      }
      product.category = req.body.category;
      categoryChanged = true;
    }

    // Update allowed fields
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    await product.save();

    // Update category counts if changed
    if (categoryChanged) {
      await Category.findByIdAndUpdate(oldCategory, { $inc: { productCount: -1 } });
      await Category.findByIdAndUpdate(product.category, { $inc: { productCount: 1 } });
    }

    res.json({ success: true, message: 'Product updated', data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @desc    Delete product (seller - own only)
// @route   DELETE /api/products/:id
router.delete('/:id', protect, roleGuard('seller'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await Category.findByIdAndUpdate(product.category, { $inc: { productCount: -1 } });

    const sellerProfile = await Seller.findOne({ userId: req.user._id });
    if (sellerProfile) {
      await Seller.findByIdAndUpdate(sellerProfile._id, { $inc: { totalProducts: -1 } });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ───────────────────────────────────────────────
// ADMIN ROUTES
// ───────────────────────────────────────────────

// @desc    Get all products (admin - including unapproved)
// @route   GET /api/products/admin/all
router.get('/admin/all', protect, roleGuard('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 15, status, search, category, seller } = req.query;

    const filter = {};

    if (status === 'pending') filter.isApproved = 'pending';
    if (status === 'approved') filter.isApproved = 'approved';
    if (status === 'rejected') filter.isApproved = 'rejected';

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) filter.category = category;
    if (seller) filter.seller = seller;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .populate('seller', 'name email')
      .populate('sellerProfile', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get counts for status tabs
    const pendingCount = await Product.countDocuments({ isApproved: 'pending' });
    const approvedCount = await Product.countDocuments({ isApproved: 'approved' });
    const rejectedCount = await Product.countDocuments({ isApproved: 'rejected' });

    res.json({
      success: true,
      count: products.length,
      total,
      pages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      pendingCount,
      approvedCount,
      rejectedCount,
      data: products,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Approve/Reject product (admin)
// @route   PUT /api/products/admin/:id/approval
router.put('/admin/:id/approval', protect, roleGuard('admin'), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.isApproved = status;
    await product.save();

    res.json({ success: true, message: `Product ${status}`, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Toggle featured (admin)
// @route   PUT /api/products/admin/:id/featured
router.put('/admin/:id/featured', protect, roleGuard('admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.isFeatured = !product.isFeatured;
    await product.save();

    res.json({
      success: true,
      message: product.isFeatured ? 'Product marked as featured' : 'Product removed from featured',
      data: product,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
