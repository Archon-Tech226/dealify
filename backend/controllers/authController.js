const User = require('../models/User');
const Seller = require('../models/Seller');
const RefreshToken = require('../models/RefreshToken');
const crypto = require('crypto');
const { generateAccessToken } = require('../middleware/auth');
const { validationResult } = require('express-validator');
const { sendPasswordResetEmail } = require('../services/emailService');

const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS || 30);

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSameSite = (process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')).toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(configuredSameSite) ? configuredSameSite : (isProduction ? 'none' : 'lax');
  let secure = typeof process.env.COOKIE_SECURE === 'string'
    ? process.env.COOKIE_SECURE === 'true'
    : isProduction;

  if (sameSite === 'none') {
    secure = true;
  }

  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  };

  const cookieDomain = (process.env.COOKIE_DOMAIN || '').trim();
  if (cookieDomain) {
    cookieOptions.domain = cookieDomain;
  }

  return cookieOptions;
}

function createRawToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(req, userId) {
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    user: userId,
    tokenHash,
    expiresAt,
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || req.connection?.remoteAddress || '',
  });

  return rawToken;
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, getRefreshCookieOptions());
}

// @desc    Register a new buyer
// @route   POST /api/auth/register
// @access  Public
const registerBuyer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email
          ? 'An account with this email already exists'
          : 'An account with this phone number already exists',
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: 'buyer',
    });

    const token = generateAccessToken(user._id);
    const refreshToken = await issueRefreshToken(req, user._id);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to Dealify.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Register Buyer Error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// @desc    Register a new seller
// @route   POST /api/auth/register-seller
// @access  Public
const registerSeller = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, phone, password, storeName, gstin, panNumber, businessAddress } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email
          ? 'An account with this email already exists'
          : 'An account with this phone number already exists',
      });
    }

    // Create user with seller role
    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: 'seller',
    });

    // Create seller profile
    const seller = await Seller.create({
      userId: user._id,
      storeName,
      gstin: gstin || '',
      panNumber: panNumber || '',
      businessAddress: businessAddress || {},
    });

    const token = generateAccessToken(user._id);
    const refreshToken = await issueRefreshToken(req, user._id);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Seller registration successful! Your account is pending approval.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
        },
        seller: {
          id: seller._id,
          storeName: seller.storeName,
          isApproved: seller.isApproved,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Register Seller Error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// @desc    Login user (buyer/seller/admin)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email address',
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.',
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password was incorrect',
      });
    }

    const token = generateAccessToken(user._id);
    const refreshToken = await issueRefreshToken(req, user._id);
    setRefreshCookie(res, refreshToken);

    // If seller, get seller profile
    let sellerData = null;
    if (user.role === 'seller') {
      sellerData = await Seller.findOne({ userId: user._id });
    }

    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
        },
        seller: sellerData ? {
          id: sellerData._id,
          storeName: sellerData.storeName,
          isApproved: sellerData.isApproved,
        } : null,
        token,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let sellerData = null;

    if (user.role === 'seller') {
      sellerData = await Seller.findOne({ userId: user._id });
    }

    res.json({
      success: true,
      data: {
        user,
        seller: sellerData,
      },
    });
  } catch (error) {
    console.error('Get Me Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Forgot password - send reset token
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.',
      });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetToken = hashToken(rawResetToken);
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    try {
      await sendPasswordResetEmail(user, rawResetToken);
    } catch (emailError) {
      console.error('Password reset email send failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Password reset instructions sent to your email.',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const hashedToken = hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token.',
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful! You can now login with your new password.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawRefreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token missing' });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await RefreshToken.findOne({ tokenHash }).populate('user');

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    if (stored.user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
    }

    const newRawRefreshToken = createRawToken();
    const newTokenHash = hashToken(newRawRefreshToken);

    stored.revokedAt = new Date();
    stored.replacedByTokenHash = newTokenHash;
    await stored.save();

    await RefreshToken.create({
      user: stored.user._id,
      tokenHash: newTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.connection?.remoteAddress || '',
    });

    setRefreshCookie(res, newRawRefreshToken);
    const accessToken = generateAccessToken(stored.user._id);

    return res.json({
      success: true,
      message: 'Token refreshed',
      data: {
        token: accessToken,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const logoutUser = async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const tokenDoc = await RefreshToken.findOne({ tokenHash });
      if (tokenDoc && !tokenDoc.revokedAt) {
        tokenDoc.revokedAt = new Date();
        await tokenDoc.save();
      }
    }

    res.clearCookie('refreshToken', {
      ...getRefreshCookieOptions(),
      maxAge: undefined,
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  registerBuyer,
  registerSeller,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logoutUser,
};
