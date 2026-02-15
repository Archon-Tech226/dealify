// Helper utility functions

// Format price in Indian Rupees
const formatPrice = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

// Generate random order ID
const generateOrderId = () => {
  const prefix = 'DLF';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// Calculate discount percentage
const calcDiscount = (mrp, price) => {
  return Math.round(((mrp - price) / mrp) * 100);
};

module.exports = {
  formatPrice,
  generateOrderId,
  calcDiscount,
};
