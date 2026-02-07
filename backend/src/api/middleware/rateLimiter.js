const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../../config/redis');
const config = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !config.security.enableRateLimiting,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  },
});

/**
 * Login rate limiter (stricter)
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true,
  skip: () => !config.security.enableRateLimiting,
  handler: (req, res) => {
    logger.warn('Login rate limit exceeded', { email: req.body.email, ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later',
    });
  },
});

/**
 * Registration rate limiter
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per IP per hour
  message: 'Too many registrations from this IP, please try again later',
  skip: () => !config.security.enableRateLimiting,
  handler: (req, res) => {
    logger.warn('Registration rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts from this IP',
    });
  },
});

module.exports = {
  apiLimiter,
  loginLimiter,
  registrationLimiter,
};
