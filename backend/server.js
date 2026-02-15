const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const dotenv = require('dotenv');
const dns = require('dns');
const path = require('path');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { validateProductionEnv } = require('./utils/validateEnv');

// Load environment variables
dotenv.config();
validateProductionEnv();

// Use Google DNS (fixes local DNS issues with MongoDB Atlas SRV records)
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Connect to MongoDB
connectDB();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && configuredOrigins.length === 0) {
  throw new Error('FRONTEND_URL or FRONTEND_URLS must be set in production');
}

if (!isProduction && configuredOrigins.length === 0) {
  configuredOrigins.push('http://localhost:3000');
}

app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: true,
  immutable: false,
}));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sellers', require('./routes/sellerRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/addresses', require('./routes/addressRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Dealify API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Server Error', { message: err.message, stack: err.stack });
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  if (!isProduction) {
    logger.info(`Dealify Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
  }
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection', { message: error?.message, stack: error?.stack });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { message: error?.message, stack: error?.stack });
});
