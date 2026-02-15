const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Category = require('../models/Category');

// ───────────────────────────────────────────────
// PUBLIC ROUTES
// ───────────────────────────────────────────────

// @desc    Get all active categories (public)
// @route   GET /api/categories
router.get('/', async (req, res) => {
  try {
    const { parent, all } = req.query;

    let filter = {};
    if (all !== 'true') {
      filter.isActive = true;
    }
    if (parent === 'null' || parent === 'root') {
      filter.parent = null;
    } else if (parent) {
      filter.parent = parent;
    }

    const categories = await Category.find(filter)
      .populate('subcategories', 'name slug icon productCount isActive')
      .sort({ sortOrder: 1, name: 1 });

    res.json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get single category by slug
// @route   GET /api/categories/:slug
router.get('/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug })
      .populate('subcategories', 'name slug icon productCount isActive');

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ───────────────────────────────────────────────
// ADMIN ROUTES
// ───────────────────────────────────────────────

// @desc    Create category
// @route   POST /api/categories
router.post('/', protect, roleGuard('admin'), async (req, res) => {
  try {
    const { name, description, icon, image, parent, sortOrder } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const category = await Category.create({
      name: name.trim(),
      description: description || '',
      icon: icon || '📦',
      image: image || '',
      parent: parent || null,
      sortOrder: sortOrder || 0,
    });

    res.status(201).json({ success: true, message: 'Category created', data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @desc    Update category
// @route   PUT /api/categories/:id
router.put('/:id', protect, roleGuard('admin'), async (req, res) => {
  try {
    const { name, description, icon, image, parent, isActive, sortOrder } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Check name uniqueness if changed
    if (name && name.trim() !== category.name) {
      const existing = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: category._id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Category name already taken' });
      }
      category.name = name.trim();
    }

    if (description !== undefined) category.description = description;
    if (icon !== undefined) category.icon = icon;
    if (image !== undefined) category.image = image;
    if (parent !== undefined) category.parent = parent || null;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;

    await category.save();

    res.json({ success: true, message: 'Category updated', data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
router.delete('/:id', protect, roleGuard('admin'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Check if category has subcategories
    const subCount = await Category.countDocuments({ parent: category._id });
    if (subCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with subcategories. Remove them first.',
      });
    }

    // Check if category has products
    const Product = require('../models/Product');
    const productCount = await Product.countDocuments({ category: category._id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${productCount} product(s). Reassign them first.`,
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
