function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'REFRESH_TOKEN_EXPIRE_DAYS',
    'CLOUDINARY_URL',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'EMAIL_FROM',
  ];

  const missing = required.filter((key) => !hasValue(process.env[key]));

  const hasFrontendOrigin = hasValue(process.env.FRONTEND_URL) || hasValue(process.env.FRONTEND_URLS);
  if (!hasFrontendOrigin) {
    missing.push('FRONTEND_URL or FRONTEND_URLS');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  validateProductionEnv,
};
