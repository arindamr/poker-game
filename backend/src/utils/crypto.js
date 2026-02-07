const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('./logger');

/**
 * Hash a password
 */
const hashPassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, config.security.bcryptRounds);
    return hash;
  } catch (error) {
    logger.error('Error hashing password', { error: error.message });
    throw error;
  }
};

/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Error comparing password', { error: error.message });
    return false;
  }
};

/**
 * Generate JWT token
 */
const generateToken = (payload, expiresIn = config.jwt.expiration) => {
  try {
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn });
    return token;
  } catch (error) {
    logger.error('Error generating token', { error: error.message });
    throw error;
  }
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (payload) => {
  try {
    const token = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiration,
    });
    return token;
  } catch (error) {
    logger.error('Error generating refresh token', { error: error.message });
    throw error;
  }
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    return payload;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { expired: true, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    logger.error('Error verifying token', { error: error.message });
    return { valid: false, error: error.message };
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret);
    return payload;
  } catch (error) {
    logger.error('Error verifying refresh token', { error: error.message });
    return null;
  }
};

/**
 * Hash a token for storage
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate device fingerprint from request
 */
const generateDeviceFingerprint = (req) => {
  const fingerprint = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprint))
    .digest('hex');
  return hash;
};

/**
 * Generate secure random token
 */
const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  hashToken,
  generateDeviceFingerprint,
  generateRandomToken,
};
