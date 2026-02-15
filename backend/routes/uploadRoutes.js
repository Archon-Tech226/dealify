const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const { protect } = require('../middleware/auth');

function parseCloudinaryUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!url.protocol.startsWith('cloudinary')) return null;

    const apiKey = decodeURIComponent(url.username || '').trim();
    const apiSecret = decodeURIComponent(url.password || '').trim();
    const cloudNameFromHost = decodeURIComponent((url.hostname || '').trim());
    const cloudNameFromPath = decodeURIComponent((url.pathname || '').replace(/^\//, '')).trim();
    const cloudName = cloudNameFromHost || cloudNameFromPath;

    if (!apiKey || !apiSecret || !cloudName) return null;
    return {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    };
  } catch (_) {
    return null;
  }
}

const cloudinaryFromUrl = parseCloudinaryUrl((process.env.CLOUDINARY_URL || '').trim());
const cloudinaryConfig = cloudinaryFromUrl || {
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
};

// Configure Cloudinary
cloudinary.config({
  ...cloudinaryConfig,
  secure: true,
});

const ALLOW_LOCAL_UPLOAD_FALLBACK = process.env.CLOUDINARY_FALLBACK_LOCAL === 'true';

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP files are allowed'), false);
    }
  },
});

// Helper: upload buffer to Cloudinary
function uploadToCloudinary(buffer, folder = 'dealify') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }] },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

function isCloudinaryConfigured() {
  return Boolean(cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret);
}

function getMissingCloudinaryFields() {
  const missing = [];
  if (!cloudinaryConfig.cloud_name) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!cloudinaryConfig.api_key) missing.push('CLOUDINARY_API_KEY');
  if (!cloudinaryConfig.api_secret) missing.push('CLOUDINARY_API_SECRET');
  return missing;
}

function getUploadDir() {
  const dir = path.join(__dirname, '..', 'uploads', 'products');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getExtensionFromFile(file) {
  const extFromName = path.extname(file.originalname || '').toLowerCase();
  if (extFromName) return extFromName;
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'image/gif') return '.gif';
  return '.jpg';
}

function saveFileLocally(file, req) {
  const uploadDir = getUploadDir();
  const ext = getExtensionFromFile(file);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const fullPath = path.join(uploadDir, fileName);
  fs.writeFileSync(fullPath, file.buffer);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    url: `${baseUrl}/uploads/products/${fileName}`,
    public_id: `local:products/${fileName}`,
  };
}

function cloudinaryFailureResponse(res, reason) {
  return res.status(503).json({
    success: false,
    code: 'CLOUDINARY_UPLOAD_FAILED',
    message: 'Cloudinary upload failed. Please verify CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
    detail: reason,
  });
}

// @desc    Upload service health check
// @route   GET /api/upload/health
router.get('/health', protect, async (req, res) => {
  const configSource = cloudinaryFromUrl ? 'CLOUDINARY_URL' : 'CLOUDINARY_*';
  const configured = isCloudinaryConfigured();
  if (!configured) {
    return res.status(200).json({
      success: false,
      provider: 'cloudinary',
      configSource,
      configured: false,
      missingFields: getMissingCloudinaryFields(),
      fallbackLocalEnabled: ALLOW_LOCAL_UPLOAD_FALLBACK,
      message: 'Cloudinary configuration is incomplete',
    });
  }

  try {
    await cloudinary.api.ping();
    return res.json({
      success: true,
      provider: 'cloudinary',
      configSource,
      configured: true,
      fallbackLocalEnabled: ALLOW_LOCAL_UPLOAD_FALLBACK,
      message: 'Cloudinary is reachable',
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      provider: 'cloudinary',
      configSource,
      configured: true,
      fallbackLocalEnabled: ALLOW_LOCAL_UPLOAD_FALLBACK,
      message: 'Cloudinary is configured but not reachable',
      detail: error.message,
    });
  }
});

// @desc    Upload single image
// @route   POST /api/upload
router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const folder = req.body.folder || 'dealify/products';
    let imageData;

    if (isCloudinaryConfigured()) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, folder);
        imageData = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      } catch (cloudinaryError) {
        if (!ALLOW_LOCAL_UPLOAD_FALLBACK) {
          return cloudinaryFailureResponse(res, cloudinaryError.message);
        }
        console.warn('Cloudinary upload failed, falling back to local upload:', cloudinaryError.message);
        imageData = saveFileLocally(req.file, req);
      }
    } else {
      if (!ALLOW_LOCAL_UPLOAD_FALLBACK) {
        return cloudinaryFailureResponse(res, `Missing fields: ${getMissingCloudinaryFields().join(', ')}`);
      }
      imageData = saveFileLocally(req.file, req);
    }

    res.json({
      success: true,
      data: imageData,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// @desc    Upload multiple images (max 5)
// @route   POST /api/upload/multiple
router.post('/multiple', protect, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No image files provided' });
    }

    const folder = req.body.folder || 'dealify/products';
    let images = [];

    if (isCloudinaryConfigured()) {
      try {
        const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer, folder));
        const results = await Promise.all(uploadPromises);
        images = results.map(r => ({
          url: r.secure_url,
          public_id: r.public_id,
        }));
      } catch (cloudinaryError) {
        if (!ALLOW_LOCAL_UPLOAD_FALLBACK) {
          return cloudinaryFailureResponse(res, cloudinaryError.message);
        }
        console.warn('Cloudinary multiple upload failed, falling back to local upload:', cloudinaryError.message);
        images = req.files.map(file => saveFileLocally(file, req));
      }
    } else {
      if (!ALLOW_LOCAL_UPLOAD_FALLBACK) {
        return cloudinaryFailureResponse(res, `Missing fields: ${getMissingCloudinaryFields().join(', ')}`);
      }
      images = req.files.map(file => saveFileLocally(file, req));
    }

    res.json({ success: true, data: images });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// @desc    Delete image from Cloudinary
// @route   DELETE /api/upload
router.delete('/', protect, async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ success: false, message: 'public_id required' });

    if (public_id.startsWith('local:')) {
      const relativePath = public_id.replace('local:', '');
      const fullPath = path.join(__dirname, '..', 'uploads', relativePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } else {
      await cloudinary.uploader.destroy(public_id);
    }

    res.json({ success: true, message: 'Image deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

module.exports = router;
