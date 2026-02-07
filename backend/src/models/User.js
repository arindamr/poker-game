const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/crypto');
const logger = require('../utils/logger');

const User = {
  /**
   * Create a new user
   */
  create: async (username, email, passwordHash, ipAddress) => {
    try {
      const result = await db.getOne(
        `INSERT INTO users (username, email, password_hash, ip_address)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, created_at`,
        [username, email, passwordHash, ipAddress],
      );
      return result;
    } catch (error) {
      logger.error('Error creating user', { error: error.message });
      throw error;
    }
  },

  /**
   * Find user by ID
   */
  findById: async (userId) => {
    try {
      return await db.getOne(
        `SELECT id, username, email, account_balance, total_balance, 
                created_at, updated_at, last_login, is_active
         FROM users WHERE id = $1`,
        [userId],
      );
    } catch (error) {
      logger.error('Error finding user', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Find user by email
   */
  findByEmail: async (email) => {
    try {
      return await db.getOne(
        `SELECT id, username, email, password_hash, account_balance, 
                total_balance, created_at, is_active
         FROM users WHERE email = $1`,
        [email],
      );
    } catch (error) {
      logger.error('Error finding user by email', { error: error.message });
      throw error;
    }
  },

  /**
   * Find user by username
   */
  findByUsername: async (username) => {
    try {
      return await db.getOne(
        `SELECT id, username, email, account_balance, is_active
         FROM users WHERE username = $1`,
        [username],
      );
    } catch (error) {
      logger.error('Error finding user by username', { error: error.message });
      throw error;
    }
  },

  /**
   * Update user
   */
  update: async (userId, updates) => {
    try {
      const fields = Object.keys(updates)
        .map((key, i) => `${key} = $${i + 1}`)
        .join(', ');
      const values = Object.values(updates);
      values.push(userId);

      const result = await db.getOne(
        `UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length}
         RETURNING id, username, email, account_balance, updated_at`,
        values,
      );
      return result;
    } catch (error) {
      logger.error('Error updating user', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Update balance
   */
  updateBalance: async (userId, amount) => {
    try {
      return await db.getOne(
        `UPDATE users SET account_balance = account_balance + $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, account_balance`,
        [amount, userId],
      );
    } catch (error) {
      logger.error('Error updating balance', { userId, error: error.message });
      throw error;
    }
  },

  /**
   * Record last login
   */
  recordLastLogin: async (userId, ipAddress) => {
    try {
      await db.query(
        `UPDATE users SET last_login = CURRENT_TIMESTAMP, ip_address = $2
         WHERE id = $1`,
        [userId, ipAddress],
      );
    } catch (error) {
      logger.error('Error recording last login', { userId, error: error.message });
    }
  },

  /**
   * Get all users (for admin)
   */
  getAll: async (limit = 50, offset = 0) => {
    try {
      return await db.getAll(
        `SELECT id, username, email, account_balance, created_at, is_active
         FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
    } catch (error) {
      logger.error('Error getting users', { error: error.message });
      throw error;
    }
  },
};

module.exports = User;
