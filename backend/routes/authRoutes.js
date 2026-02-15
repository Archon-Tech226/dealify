const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  registerBuyer,
  registerSeller,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logoutUser,
} = require('../controllers/authController');

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('phone').matches(/^[6-9]\d{9}$/).withMessage('Please enter a valid 10-digit Indian phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const sellerRegisterValidation = [
  ...registerValidation,
  body('storeName').trim().notEmpty().withMessage('Store name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Store name must be 2-100 characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// Routes
router.post('/register', registerValidation, registerBuyer);
router.post('/register-seller', sellerRegisterValidation, registerSeller);
router.post('/login', loginValidation, loginUser);
router.get('/me', protect, getMe);
router.post('/forgot-password', 
  body('email').isEmail().withMessage('Please enter a valid email'),
  forgotPassword
);
router.post('/reset-password',
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  resetPassword
);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logoutUser);

module.exports = router;
