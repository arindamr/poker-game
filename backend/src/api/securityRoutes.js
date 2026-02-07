/**
 * Security Routes - Phase 5 Integration
 * Implements 2FA, anti-cheat monitoring, and compliance endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const twoFactorAuth = require('../utils/twoFactorAuth');
const antiCheatEngine = require('../game/antiCheatEngine');
const complianceService = require('../utils/complianceService');
const rateLimiter = require('../middleware/enhancedRateLimiter');
const { authenticateToken, authorizeRole } = require('./middleware/authMiddleware');
const logger = require('../utils/logger');

/**
 * 2FA Management Endpoints
 */

// Enable 2FA for current user
router.post('/2fa/enable', authenticateToken, rateLimiter.middleware({ max: 10, window: 60000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.body.email || req.user.email;

    // Check if 2FA already enabled
    const user = await db.query('SELECT two_fa_enabled FROM users WHERE id = $1', [userId]);
    if (user.rows[0]?.two_fa_enabled) {
      return res.status(400).json({ error: '2FA already enabled' });
    }

    // Generate 2FA secret and backup codes
    const { secret, backupCodes } = await twoFactorAuth.enable2FA(userId, email);

    // Generate QR code
    const qrCode = await twoFactorAuth.generateQRCode(secret);

    // Store pending 2FA (not yet verified)
    await db.query(
      'UPDATE users SET two_fa_secret = $1, two_fa_pending = true WHERE id = $2',
      [secret, userId]
    );

    logger.info(`2FA setup initiated for user ${userId}`);

    res.json({
      secret,
      qrCode,
      backupCodes,
      message: 'Verify with authenticator app and provide token to complete setup',
    });
  } catch (error) {
    logger.error('2FA enable error:', error);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// Verify 2FA setup with TOTP token
router.post('/2fa/verify-setup', authenticateToken, rateLimiter.middleware({ max: 5, window: 60000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // Get pending 2FA secret
    const user = await db.query(
      'SELECT two_fa_secret FROM users WHERE id = $1 AND two_fa_pending = true',
      [userId]
    );

    if (!user.rows[0]) {
      return res.status(400).json({ error: 'No pending 2FA setup' });
    }

    // Verify token
    const isValid = await twoFactorAuth.verify2FASetup(userId, token);

    if (!isValid) {
      // Log failed attempt
      await db.query(
        'INSERT INTO two_fa_audit (user_id, event_type, success, ip_address) VALUES ($1, $2, $3, $4)',
        [userId, 'setup_failed', false, req.ip]
      );

      return res.status(401).json({ error: 'Invalid token' });
    }

    // Enable 2FA
    await db.query(
      'UPDATE users SET two_fa_enabled = true, two_fa_pending = false WHERE id = $1',
      [userId]
    );

    // Log success
    await db.query(
      'INSERT INTO two_fa_audit (user_id, event_type, success, ip_address) VALUES ($1, $2, $3, $4)',
      [userId, 'enabled', true, req.ip]
    );

    logger.info(`2FA enabled for user ${userId}`);

    res.json({ message: '2FA successfully enabled' });
  } catch (error) {
    logger.error('2FA verify setup error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// Disable 2FA (requires password verification)
router.post('/2fa/disable', authenticateToken, rateLimiter.middleware({ max: 5, window: 60000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    // Verify password
    const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const crypto = require('crypto');
    const passwordValid = crypto.timingSafeEqual(
      Buffer.from(user.rows[0].password_hash),
      Buffer.from(password)
    );

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Disable 2FA
    await twoFactorAuth.disable2FA(userId, password);

    // Log disablement
    await db.query(
      'INSERT INTO two_fa_audit (user_id, event_type, success, ip_address) VALUES ($1, $2, $3, $4)',
      [userId, 'disabled', true, req.ip]
    );

    logger.info(`2FA disabled for user ${userId}`);

    res.json({ message: '2FA successfully disabled' });
  } catch (error) {
    logger.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Get 2FA status
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await twoFactorAuth.get2FAStatus(userId);
    res.json(status);
  } catch (error) {
    logger.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// Use backup code
router.post('/2fa/backup-code', authenticateToken, rateLimiter.middleware({ max: 10, window: 60000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { backupCode } = req.body;

    if (!backupCode) {
      return res.status(400).json({ error: 'Backup code required' });
    }

    const result = await twoFactorAuth.useBackupCode(userId, backupCode);

    if (!result) {
      return res.status(401).json({ error: 'Invalid backup code' });
    }

    logger.info(`Backup code used for user ${userId}`);

    res.json({ message: 'Backup code verified', remaining: result.remaining });
  } catch (error) {
    logger.error('Backup code error:', error);
    res.status(500).json({ error: 'Failed to use backup code' });
  }
});

/**
 * Anti-Cheat Monitoring Endpoints
 */

// Report cheat suspicion (called after game action)
router.post('/game/:gameId/monitor-cheat', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;
    const { actionTime, actionType, amount } = req.body;

    // Detect RTA
    const rtaRisk = await antiCheatEngine.detectRTA(gameId, userId, actionTime);

    // Detect multi-account
    const multiAccountRisk = await antiCheatEngine.detectMultiAccount(userId);

    // Detect collusion (only if in table with other players)
    let collusionRisk = 0;
    if (req.body.tableId) {
      collusionRisk = await antiCheatEngine.detectCollusion(gameId, req.body.tableId);
    }

    // Calculate combined risk
    const totalRisk = Math.max(rtaRisk, multiAccountRisk, collusionRisk);

    // If suspicious, log it
    if (totalRisk > 0.7) {
      await db.query(
        `INSERT INTO cheat_detection 
         (user_id, game_id, suspicion_type, risk_score, details, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          userId,
          gameId,
          totalRisk > 0.85 ? 'confirmed' : 'suspected',
          totalRisk,
          JSON.stringify({ rtaRisk, multiAccountRisk, collusionRisk, actionType, amount }),
        ]
      );

      logger.warn(`Cheat suspicion detected for user ${userId}: risk ${totalRisk}`);

      // Ban if confirmed
      if (totalRisk > 0.85) {
        await db.query(
          'UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2',
          ['Confirmed cheat detection', userId]
        );
      }
    }

    res.json({ riskScore: totalRisk, flagged: totalRisk > 0.7 });
  } catch (error) {
    logger.error('Cheat monitoring error:', error);
    res.status(500).json({ error: 'Failed to monitor cheat' });
  }
});

// Verify shuffle randomness
router.post('/game/:gameId/verify-shuffle', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { seed, deck } = req.body;

    const isValid = await antiCheatEngine.verifyShuffle(gameId, seed, deck);

    if (!isValid) {
      logger.error(`Invalid shuffle detected in game ${gameId}`);

      // Log the suspicious shuffle
      await db.query(
        `INSERT INTO cheat_detection 
         (game_id, suspicion_type, risk_score, details) 
         VALUES ($1, $2, $3, $4)`,
        [gameId, 'invalid_shuffle', 0.95, JSON.stringify({ seed, deckLength: deck.length })]
      );
    }

    res.json({ valid: isValid });
  } catch (error) {
    logger.error('Shuffle verification error:', error);
    res.status(500).json({ error: 'Failed to verify shuffle' });
  }
});

/**
 * Compliance & KYC/AML Endpoints
 */

// Initiate KYC verification
router.post('/kyc/initiate', authenticateToken, rateLimiter.middleware({ max: 5, window: 3600000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstName, lastName, dateOfBirth } = req.body;

    // Check sanctions list
    const sanctioned = await complianceService.checkSanctionsList(userId, firstName, lastName);

    if (sanctioned) {
      logger.warn(`User ${userId} is on sanctions list`);
      return res.status(403).json({ error: 'User is on sanctions list' });
    }

    // Initialize KYC
    const verificationId = await complianceService.initializeKYC(userId, req.user.email);

    // Log KYC initiation
    await db.query(
      `INSERT INTO compliance_audit 
       (user_id, verification_type, status, details) 
       VALUES ($1, $2, $3, $4)`,
      [userId, 'kyc', 'initiated', JSON.stringify({ firstName, lastName, dateOfBirth })]
    );

    logger.info(`KYC verification initiated for user ${userId}`);

    res.json({ verificationId, message: 'KYC verification started' });
  } catch (error) {
    logger.error('KYC initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate KYC' });
  }
});

// Get KYC status
router.get('/kyc/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await complianceService.getComplianceStatus(userId);
    res.json(status);
  } catch (error) {
    logger.error('KYC status error:', error);
    res.status(500).json({ error: 'Failed to get KYC status' });
  }
});

// Process deposit with compliance checks
router.post('/financial/deposit', authenticateToken, rateLimiter.middleware({ max: 20, window: 3600000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Check deposit limits
    const limitViolation = await complianceService.checkDepositLimits(userId, amount);

    if (limitViolation) {
      logger.warn(`Deposit limit violation for user ${userId}: ${amount}`);

      // Log the violation
      await db.query(
        `INSERT INTO rate_limit_violations 
         (user_id, violation_type, details) 
         VALUES ($1, $2, $3)`,
        [userId, 'deposit_limit', JSON.stringify({ amount, limit: limitViolation })]
      );

      return res.status(403).json({ error: 'Deposit limit exceeded', limit: limitViolation });
    }

    // Monitor transaction for AML
    const amlResult = await complianceService.monitorTransaction(userId, amount, 'deposit');

    // Log the deposit
    await db.query(
      `INSERT INTO deposits_withdrawals 
       (user_id, transaction_type, amount, payment_method, status, aml_status) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'deposit', amount, paymentMethod, 'pending', amlResult.status]
    );

    // If AML suspicious, create SAR
    if (amlResult.suspicious) {
      await complianceService.createSAR(userId, {
        type: 'suspicious_deposit',
        amount,
        reason: amlResult.reason,
      });

      logger.warn(`SAR created for user ${userId}: ${amlResult.reason}`);

      return res.status(403).json({ error: 'Transaction flagged for review' });
    }

    logger.info(`Deposit processed for user ${userId}: ${amount}`);

    res.json({ message: 'Deposit processed', transactionId: 'tx_' + Date.now() });
  } catch (error) {
    logger.error('Deposit processing error:', error);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

// Enable self-exclusion
router.post('/responsible-gaming/self-exclude', authenticateToken, rateLimiter.middleware({ max: 2, window: 86400000 }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { duration } = req.body; // '7d', '30d', 'permanent'

    const validDurations = ['7d', '30d', 'permanent'];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    // Enable self-exclusion
    await complianceService.enableSelfExclusion(userId, duration);

    // Update user
    const untilDate = duration === 'permanent' ? null : new Date(Date.now() + getDurationMs(duration));

    await db.query(
      'UPDATE users SET is_suspended = true, suspension_reason = $1, suspension_until = $2 WHERE id = $3',
      ['Self-exclusion', untilDate, userId]
    );

    // Log self-exclusion
    await db.query(
      `INSERT INTO self_exclusions 
       (user_id, duration, enabled_at, until_at) 
       VALUES ($1, $2, NOW(), $3)`,
      [userId, duration, untilDate]
    );

    logger.info(`Self-exclusion enabled for user ${userId}: ${duration}`);

    res.json({ message: `Self-exclusion enabled for ${duration}` });
  } catch (error) {
    logger.error('Self-exclusion error:', error);
    res.status(500).json({ error: 'Failed to enable self-exclusion' });
  }
});

// Get compliance dashboard (admin only)
router.get('/compliance/dashboard', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const report = await complianceService.generateComplianceReport(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date()
    );

    // Get SAR reports
    const sars = await db.query(
      `SELECT * FROM sar_reports 
       WHERE created_at > NOW() - INTERVAL '7 days' 
       ORDER BY created_at DESC`
    );

    // Get cheat detections
    const cheats = await db.query(
      `SELECT * FROM cheat_detection 
       WHERE created_at > NOW() - INTERVAL '7 days' 
       ORDER BY created_at DESC 
       LIMIT 20`
    );

    res.json({
      report,
      sars: sars.rows,
      cheats: cheats.rows,
    });
  } catch (error) {
    logger.error('Compliance dashboard error:', error);
    res.status(500).json({ error: 'Failed to get compliance dashboard' });
  }
});

// Helper function to get duration in milliseconds
function getDurationMs(duration) {
  const durationMap = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return durationMap[duration] || 0;
}

module.exports = router;
