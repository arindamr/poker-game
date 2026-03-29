const { verifyToken, hashToken } = require('../../utils/crypto');
const logger = require('../../utils/logger');
const config = require('../../config/env');
const Session = require('../../models/Session');

/**
 * Phase 5: Enhanced Session Security Middleware
 * Authenticates JWT token and validates session in database
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer token

    if (!token) {
      logger.debug('No token provided', { path: req.path, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided',
      });
    }

    // 1. Verify JWT signature and expiration
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

    // 2. Validate session in database (Phase 5: Session Hardening)
    const tokenHash = hashToken(token);
    const session = await Session.findByTokenHash(tokenHash);

    if (!session || !session.is_active) {
      logger.warn('Unauthorized: Inactive or missing session', { userId: payload.sub, tokenHash });
      return res.status(401).json({
        success: false,
        error: 'Session is no longer valid',
        code: 'SESSION_INVALID',
      });
    }

    // 3. IP Validation (Prevent session hijacking)
    if (config.security.validateSessionIP && session.ip_address !== req.ip) {
      logger.warn('Session IP mismatch', {
        userId: payload.sub,
        originalIP: session.ip_address,
        currentIP: req.ip
      });

      if (config.nodeEnv !== 'development') {
        await Session.invalidate(session.id);
        return res.status(401).json({
          success: false,
          error: 'Security alert: Session IP changed',
          code: 'IP_MISMATCH',
        });
      }
    }

    // 4. Activity Timeout (Sliding window: 30 minutes)
    const lastActivity = new Date(session.last_activity);
    const inactiveMs = Date.now() - lastActivity.getTime();
    const timeoutMs = 30 * 60 * 1000; // 30 minutes

    if (inactiveMs > timeoutMs) {
      logger.info('Session timed out', { userId: payload.sub, inactiveMs });
      await Session.invalidate(session.id);
      return res.status(401).json({
        success: false,
        error: 'Session timed out due to inactivity',
        code: 'SESSION_TIMEOUT',
      });
    }

    // Update last activity
    await Session.updateLastActivity(session.id);

    // Normalize user id to support legacy routes
    if (payload && payload.sub && !payload.id) {
      payload.id = payload.sub;
    }

    req.user = payload;
    req.sessionId = session.id;
    return next();
  } catch (err) {
    logger.error('authenticateToken error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
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
