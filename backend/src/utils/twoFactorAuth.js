const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../utils/logger');
const db = require('../config/database');
const bcryptjs = require('bcryptjs');

/**
 * 2FA Service using TOTP (Time-based One-Time Password)
 * Supports Google Authenticator, Authy, Microsoft Authenticator, etc.
 */
class TwoFactorAuthService {
  /**
   * Generate 2FA secret for user
   */
  static generateSecret(email) {
    return speakeasy.generateSecret({
      name: `Poker Game (${email})`,
      issuer: 'Poker Game',
      length: 32,
    });
  }

  /**
   * Generate QR code for 2FA setup
   */
  static async generateQRCode(secret) {
    try {
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);
      return qrCode;
    } catch (error) {
      logger.error('QR code generation error:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP token
   */
  static verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 1 step before/after for clock skew
    });
  }

  /**
   * Enable 2FA for user
   */
  static async enable2FA(userId, email) {
    try {
      const secret = this.generateSecret(email);
      const qrCode = await this.generateQRCode(secret);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes(10);
      const hashedBackupCodes = backupCodes.map(code => 
        crypto.createHash('sha256').update(code).digest('hex')
      );

      // Store temporarily in cache (not yet enabled)
      await db.query(
        `UPDATE users SET 
          two_fa_secret = $1, 
          two_fa_pending = true,
          backup_codes_hash = $2
        WHERE id = $3`,
        [secret.base32, JSON.stringify(hashedBackupCodes), userId]
      );

      logger.info(`2FA setup initiated for user ${userId}`);

      return {
        secret: secret.base32,
        qrCode,
        backupCodes,
      };
    } catch (error) {
      logger.error('2FA enable error:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA setup with TOTP token
   */
  static async verify2FASetup(userId, token) {
    try {
      const userResult = await db.query(
        'SELECT two_fa_secret FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows[0]?.two_fa_secret) {
        throw new Error('2FA not in setup mode');
      }

      const isValid = this.verifyToken(userResult.rows[0].two_fa_secret, token);

      if (!isValid) {
        logger.warn(`Invalid 2FA token for user ${userId}`);
        throw new Error('Invalid authentication code');
      }

      // Enable 2FA
      await db.query(
        `UPDATE users SET two_fa_enabled = true, two_fa_pending = false 
        WHERE id = $1`,
        [userId]
      );

      logger.info(`2FA enabled for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('2FA verification error:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP during login
   */
  static async verify2FALogin(userId, token) {
    try {
      const userResult = await db.query(
        'SELECT two_fa_secret FROM users WHERE id = $1 AND two_fa_enabled = true',
        [userId]
      );

      if (!userResult.rows[0]) {
        throw new Error('2FA not enabled for user');
      }

      const isValid = this.verifyToken(userResult.rows[0].two_fa_secret, token);

      if (!isValid) {
        logger.warn(`Failed 2FA login attempt for user ${userId}`);
        throw new Error('Invalid authentication code');
      }

      logger.info(`Successful 2FA login for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('2FA login verification error:', error);
      throw error;
    }
  }

  /**
   * Use backup code
   */
  static async useBackupCode(userId, backupCode) {
    try {
      const userResult = await db.query(
        'SELECT backup_codes_hash FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows[0]?.backup_codes_hash) {
        throw new Error('No backup codes found');
      }

      const hashedCodes = JSON.parse(userResult.rows[0].backup_codes_hash);
      const codeHash = crypto.createHash('sha256').update(backupCode).digest('hex');

      const codeIndex = hashedCodes.indexOf(codeHash);
      if (codeIndex === -1) {
        logger.warn(`Invalid backup code attempt for user ${userId}`);
        throw new Error('Invalid backup code');
      }

      // Remove used code
      hashedCodes.splice(codeIndex, 1);
      await db.query(
        'UPDATE users SET backup_codes_hash = $1 WHERE id = $2',
        [JSON.stringify(hashedCodes), userId]
      );

      logger.info(`Backup code used for user ${userId}. Remaining: ${hashedCodes.length}`);
      return true;
    } catch (error) {
      logger.error('Backup code verification error:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA
   */
  static async disable2FA(userId, password) {
    try {
      // Verify password before disabling 2FA
      const userResult = await db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows[0]) {
        throw new Error('User not found');
      }

      const isValidPassword = await bcryptjs.compare(password, userResult.rows[0].password_hash);

      if (!isValidPassword) {
        logger.warn(`Password verification failed for 2FA disable, user ${userId}`);
        throw new Error('Invalid password');
      }

      // Disable 2FA
      await db.query(
        `UPDATE users SET 
          two_fa_enabled = false, 
          two_fa_secret = NULL,
          backup_codes_hash = NULL
        WHERE id = $1`,
        [userId]
      );

      logger.info(`2FA disabled for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('2FA disable error:', error);
      throw error;
    }
  }

  /**
   * Generate backup codes
   */
  static generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  /**
   * Get 2FA status
   */
  static async get2FAStatus(userId) {
    try {
      const result = await db.query(
        `SELECT two_fa_enabled, backup_codes_hash FROM users WHERE id = $1`,
        [userId]
      );

      if (!result.rows[0]) {
        throw new Error('User not found');
      }

      const backupCodesHash = result.rows[0].backup_codes_hash;
      const remainingBackupCodes = backupCodesHash 
        ? JSON.parse(backupCodesHash).length 
        : 0;

      return {
        enabled: result.rows[0].two_fa_enabled,
        remainingBackupCodes,
      };
    } catch (error) {
      logger.error('2FA status check error:', error);
      throw error;
    }
  }
}

module.exports = TwoFactorAuthService;
