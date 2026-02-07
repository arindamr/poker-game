const db = require('../config/database');
const logger = require('../utils/logger');

const Session = {
  /**
   * Create a new session
   */
  create: async (userId, tokenHash, deviceId, ipAddress, userAgent, expiresAt) => {
    try {
      const result = await db.getOne(
        `INSERT INTO sessions (user_id, token_hash, device_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, token_hash, created_at`,
        [userId, tokenHash, deviceId, ipAddress, userAgent, expiresAt],
      );
      return result;
    } catch (error) {
      logger.error('Error creating session', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Find session by token hash
   */
  findByTokenHash: async (tokenHash) => {
    try {
      return await db.getOne(
        `SELECT id, user_id, token_hash, expires_at, is_active, last_activity
         FROM sessions WHERE token_hash = $1 AND is_active = true`,
        [tokenHash],
      );
    } catch (error) {
      logger.error('Error finding session', { error: error.message });
      throw error;
    }
  },

  /**
   * Find session by user ID
   */
  findByUserId: async (userId) => {
    try {
      return await db.getAll(
        `SELECT id, user_id, token_hash, device_id, ip_address, expires_at, created_at, is_active
         FROM sessions WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [userId],
      );
    } catch (error) {
      logger.error('Error finding sessions by user', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Update last activity
   */
  updateLastActivity: async (sessionId) => {
    try {
      await db.query(
        `UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );
    } catch (error) {
      logger.error('Error updating session activity', { sessionId, error: error.message });
    }
  },

  /**
   * Invalidate session
   */
  invalidate: async (sessionId) => {
    try {
      await db.query(
        `UPDATE sessions SET is_active = false WHERE id = $1`,
        [sessionId],
      );
    } catch (error) {
      logger.error('Error invalidating session', { sessionId, error: error.message });
      throw error;
    }
  },

  /**
   * Invalidate all user sessions
   */
  invalidateAllUserSessions: async (userId) => {
    try {
      await db.query(
        `UPDATE sessions SET is_active = false WHERE user_id = $1`,
        [userId],
      );
    } catch (error) {
      logger.error('Error invalidating user sessions', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Clean up expired sessions
   */
  cleanupExpired: async () => {
    try {
      await db.query(
        `UPDATE sessions SET is_active = false WHERE expires_at < CURRENT_TIMESTAMP`,
      );
    } catch (error) {
      logger.error('Error cleaning up expired sessions', { error: error.message });
    }
  },

  /**
   * Get session count for user
   */
  getUserSessionCount: async (userId) => {
    try {
      const result = await db.getOne(
        `SELECT COUNT(*) as count FROM sessions WHERE user_id = $1 AND is_active = true`,
        [userId],
      );
      return parseInt(result.count, 10);
    } catch (error) {
      logger.error('Error getting session count', { userId, error: error.message });
      return 0;
    }
  },
};

module.exports = Session;
