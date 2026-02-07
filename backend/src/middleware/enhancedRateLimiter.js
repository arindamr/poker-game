const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Rate limiter with progressive penalties and violation tracking
 */
class EnhancedRateLimiter {
  constructor() {
    this.violations = new Map(); // Track violation counts per key
  }

  /**
   * Get violation count for a key
   */
  async getViolations(key) {
    const violations = await redis.get(`violations:${key}`);
    return violations ? parseInt(violations) : 0;
  }

  /**
   * Increment violation count
   */
  async recordViolation(key, ttl = 86400) {
    const violations = await this.getViolations(key);
    const newCount = violations + 1;
    await redis.setex(`violations:${key}`, ttl, newCount);
    return newCount;
  }

  /**
   * Reset violation count
   */
  async resetViolations(key) {
    await redis.del(`violations:${key}`);
  }

  /**
   * Check if key is blocked
   */
  async isBlocked(key) {
    const blocked = await redis.get(`blocked:${key}`);
    return !!blocked;
  }

  /**
   * Block a key with progressive penalties
   * @param {string} key - User ID or IP
   * @param {number} violations - Current violation count
   */
  async blockKey(key, violations) {
    let blockDuration;

    if (violations === 1) {
      blockDuration = 600; // 10 minutes
      logger.warn(`Rate limit violation #1 for ${key}: 10-minute cooldown`);
    } else if (violations === 2) {
      blockDuration = 3600; // 1 hour
      logger.warn(`Rate limit violation #2 for ${key}: 1-hour cooldown`);
    } else if (violations === 3) {
      blockDuration = 86400; // 24 hours
      logger.warn(`Rate limit violation #3 for ${key}: 24-hour ban`);
    } else if (violations >= 4) {
      // Permanent ban - requires manual review
      await redis.set(`blocked:permanent:${key}`, '1');
      logger.error(`Rate limit violation #${violations} for ${key}: PERMANENT BAN - manual review required`);
      return;
    }

    await redis.setex(`blocked:${key}`, blockDuration, '1');
  }

  /**
   * Rate limiter middleware
   * @param {Object} options - Configuration
   * @param {number} options.maxAttempts - Max attempts
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {string} options.endpoint - Endpoint name for logging
   */
  middleware(options = {}) {
    const {
      maxAttempts = 100,
      windowMs = 60000, // 1 minute default
      endpoint = 'unknown',
      keyGenerator = (req) => req.ip || req.connection.remoteAddress,
    } = options;

    return async (req, res, next) => {
      const key = keyGenerator(req);

      try {
        // Check permanent ban
        const permanentBan = await redis.get(`blocked:permanent:${key}`);
        if (permanentBan) {
          logger.error(`Permanent ban attempt from ${key} on ${endpoint}`);
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Access denied. Account has been permanently suspended.',
          });
        }

        // Check temporary block
        const isBlocked = await redis.get(`blocked:${key}`);
        if (isBlocked) {
          logger.warn(`Blocked attempt from ${key} on ${endpoint}`);
          return res.status(429).json({
            success: false,
            error: 'RATE_LIMITED',
            message: 'Too many attempts. Please try again later.',
            retryAfter: await redis.ttl(`blocked:${key}`),
          });
        }

        // Check rate limit
        const count = await redis.incr(`ratelimit:${endpoint}:${key}`);
        const ttl = await redis.ttl(`ratelimit:${endpoint}:${key}`);

        if (count === 1) {
          // First request in window
          await redis.expire(`ratelimit:${endpoint}:${key}`, Math.ceil(windowMs / 1000));
        }

        const remaining = Math.max(0, maxAttempts - count);

        res.setHeader('X-RateLimit-Limit', maxAttempts);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + ttl * 1000).toISOString());

        if (count > maxAttempts) {
          logger.warn(`Rate limit exceeded for ${key} on ${endpoint}. Attempts: ${count}/${maxAttempts}`);

          // Record violation and apply progressive penalty
          const violations = await this.recordViolation(key);
          await this.blockKey(key, violations);

          return res.status(429).json({
            success: false,
            error: 'RATE_LIMITED',
            message: `Rate limit exceeded. You have been temporarily blocked.`,
            violations,
            resetTime: await redis.ttl(`blocked:${key}`),
          });
        }

        next();
      } catch (error) {
        logger.error('Rate limiter error:', error);
        // On error, allow request to proceed
        next();
      }
    };
  }
}

module.exports = new EnhancedRateLimiter();
