const { verifyToken } = require('../../utils/crypto');
const logger = require('../../utils/logger');
const config = require('../../config/env');

/**
 * Authenticate JWT token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer token

  if (!token) {
    logger.debug('No token provided', { path: req.path, ip: req.ip });
    return res.status(401).json({
      success: false,
      error: 'No authentication token provided',
    });
  }

  const payload = verifyToken(token);

  if (payload.expired) {
    logger.debug('Token expired', { userId: req.body?.userId });
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  if (!payload.sub) {
    logger.warn('Invalid token', { token: token.substring(0, 20) });
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }

  // Normalize user id to support legacy routes that read req.user.id
  if (payload && payload.sub && !payload.id) {
    payload.id = payload.sub;
  }

  req.user = payload;
  next();
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const payload = verifyToken(token);
    if (payload.sub) {
      if (!payload.id) {
        payload.id = payload.sub;
      }
      req.user = payload;
    }
  }

  next();
};

/**
 * Role-based authorization
 */
const authorizeRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (req.user.role !== role) {
      logger.warn('Unauthorized role access attempt', { userId: req.user.sub, required: role, actual: req.user.role });
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authorizeRole,
  requireAdmin: (req, res, next) => {
    if (!req.user?.email) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const allowed = config.admin?.emails || [];
    if (allowed.length === 0 || !allowed.includes(req.user.email)) {
      logger.warn('Admin access denied', { userId: req.user.sub, email: req.user.email });
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    return next();
  },
};
