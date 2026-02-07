const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * KYC (Know Your Customer) and AML (Anti-Money Laundering) compliance service
 * Handles user verification and sanctions screening
 */
class ComplianceService {
  /**
   * Start KYC verification process
   */
  static async initializeKYC(userId, email) {
    try {
      // Create KYC audit record
      const result = await db.query(
        `INSERT INTO compliance_audit (user_id, audit_type, status)
         VALUES ($1, 'kyc', 'pending')
         RETURNING id`,
        [userId]
      );

      logger.info(`KYC verification initiated for user ${userId}`);

      return {
        auditId: result.rows[0].id,
        status: 'pending',
        requiredDocuments: [
          'photo_id',
          'proof_of_address',
          'selfie_verification',
        ],
      };
    } catch (error) {
      logger.error('KYC initialization error:', error);
      throw error;
    }
  }

  /**
   * Check user against OFAC sanctions list
   * In production, integrate with real OFAC API
   */
  static async checkSanctionsList(userId, firstName, lastName) {
    try {
      // Simulated OFAC check - in production use real API
      const sanctionedNames = [
        // List would be loaded from OFAC database
        'known_sanctions_person_1',
        'known_sanctions_person_2',
      ];

      const fullName = `${firstName} ${lastName}`.toLowerCase();

      const isSanctioned = sanctionedNames.some(name =>
        fullName.includes(name.toLowerCase())
      );

      if (isSanctioned) {
        logger.error(`SANCTIONS VIOLATION: User ${userId} matches OFAC list`);

        // Block account immediately
        await db.query(
          `UPDATE users SET is_banned = true, ban_reason = 'OFAC_SANCTIONS'
           WHERE id = $1`,
          [userId]
        );

        return {
          sanctioned: true,
          action: 'blocked',
          reason: 'Account blocked due to sanctions violation',
        };
      }

      return { sanctioned: false };
    } catch (error) {
      logger.error('Sanctions check error:', error);
      return { sanctioned: false, error };
    }
  }

  /**
   * Monitor transactions for suspicious activity
   */
  static async monitorTransaction(userId, amount, transactionType) {
    try {
      const suspicious = [];

      // Check 1: Large transaction ($10,000+)
      if (amount >= 10000) {
        suspicious.push({
          type: 'LARGE_TRANSACTION',
          severity: 'HIGH',
          reason: `Transaction amount $${amount} exceeds $10,000 threshold`,
        });
      }

      // Check 2: Rapid fund movements
      const recentTransactions = await db.query(
        `SELECT SUM(amount) as total FROM deposit_withdrawals
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId]
      );

      const recentTotal = recentTransactions.rows[0]?.total || 0;
      if (recentTotal > 50000) {
        suspicious.push({
          type: 'RAPID_MOVEMENT',
          severity: 'MEDIUM',
          reason: `$${recentTotal} moved in 1 hour`,
        });
      }

      // Check 3: Structuring detection (avoiding $10k threshold)
      const structuringPattern = await db.query(
        `SELECT COUNT(*) as transaction_count, SUM(amount) as total
         FROM deposit_withdrawals
         WHERE user_id = $1 
         AND amount BETWEEN 9000 AND 9999
         AND created_at > NOW() - INTERVAL '30 days'`,
        [userId]
      );

      const pattern = structuringPattern.rows[0];
      if (pattern.transaction_count >= 3 && pattern.total > 50000) {
        suspicious.push({
          type: 'STRUCTURING',
          severity: 'HIGH',
          reason: 'Suspicious pattern of just-under-$10k transactions',
          count: pattern.transaction_count,
          total: pattern.total,
        });
      }

      // Check 4: Unusual deposit patterns
      if (transactionType === 'deposit') {
        const weeklyDeposits = await db.query(
          `SELECT COUNT(*) as count FROM deposit_withdrawals
           WHERE user_id = $1 AND transaction_type = 'deposit'
           AND created_at > NOW() - INTERVAL '7 days'`,
          [userId]
        );

        if (weeklyDeposits.rows[0].count > 20) {
          suspicious.push({
            type: 'UNUSUAL_FREQUENCY',
            severity: 'MEDIUM',
            reason: `${weeklyDeposits.rows[0].count} deposits in 7 days`,
          });
        }
      }

      // Log if suspicious
      if (suspicious.length > 0) {
        logger.warn(`Suspicious activity detected for user ${userId}:`, suspicious);

        // Create SAR (Suspicious Activity Report)
        await this.createSAR(userId, {
          amount,
          transactionType,
          suspiciousPatterns: suspicious,
        });

        return {
          suspicious: true,
          flags: suspicious,
          requiresReview: true,
        };
      }

      return { suspicious: false };
    } catch (error) {
      logger.error('Transaction monitoring error:', error);
      return { suspicious: false, error };
    }
  }

  /**
   * Create Suspicious Activity Report (SAR)
   */
  static async createSAR(userId, details) {
    try {
      const result = await db.query(
        `INSERT INTO compliance_audit (user_id, audit_type, status, details, manual_review_required)
         VALUES ($1, 'aml', 'flagged', $2, true)
         RETURNING id`,
        [userId, JSON.stringify(details)]
      );

      logger.error(`SAR created for user ${userId}. Report ID: ${result.rows[0].id}`);

      // In production, file with FinCEN
      return {
        sarId: result.rows[0].id,
        filed: true,
        requiresManualReview: true,
      };
    } catch (error) {
      logger.error('SAR creation error:', error);
      throw error;
    }
  }

  /**
   * Check deposit limits
   */
  static async checkDepositLimits(userId, amount) {
    try {
      const userResult = await db.query(
        `SELECT daily_deposit_limit, daily_deposit_used FROM users WHERE id = $1`,
        [userId]
      );

      if (!userResult.rows[0]) {
        throw new Error('User not found');
      }

      const { daily_deposit_limit, daily_deposit_used } = userResult.rows[0];
      const remainingToday = daily_deposit_limit - daily_deposit_used;

      if (amount > remainingToday) {
        return {
          allowed: false,
          reason: 'Daily deposit limit exceeded',
          limit: daily_deposit_limit,
          used: daily_deposit_used,
          remaining: remainingToday,
        };
      }

      return {
        allowed: true,
        remaining: remainingToday - amount,
      };
    } catch (error) {
      logger.error('Deposit limit check error:', error);
      throw error;
    }
  }

  /**
   * Enable self-exclusion (responsible gaming)
   */
  static async enableSelfExclusion(userId, duration = '7 days') {
    try {
      const exclusionEnd = new Date();
      
      if (duration === '7 days') {
        exclusionEnd.setDate(exclusionEnd.getDate() + 7);
      } else if (duration === '30 days') {
        exclusionEnd.setDate(exclusionEnd.getDate() + 30);
      } else if (duration === 'permanent') {
        exclusionEnd.setFullYear(2099); // Far future date
      }

      await db.query(
        `UPDATE users SET 
          is_suspended = true,
          suspension_reason = 'SELF_EXCLUSION',
          suspension_until = $1
         WHERE id = $2`,
        [exclusionEnd, userId]
      );

      logger.info(`Self-exclusion enabled for user ${userId} until ${exclusionEnd}`);

      return {
        enabled: true,
        exclusionEnd,
        duration,
      };
    } catch (error) {
      logger.error('Self-exclusion error:', error);
      throw error;
    }
  }

  /**
   * Get compliance status
   */
  static async getComplianceStatus(userId) {
    try {
      const result = await db.query(
        `SELECT 
          (SELECT status FROM compliance_audit WHERE user_id = $1 AND audit_type = 'kyc' ORDER BY created_at DESC LIMIT 1) as kyc_status,
          (SELECT status FROM compliance_audit WHERE user_id = $1 AND audit_type = 'aml' ORDER BY created_at DESC LIMIT 1) as aml_status,
          is_suspended,
          suspension_until,
          is_banned
         FROM users WHERE id = $1`,
        [userId]
      );

      if (!result.rows[0]) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Compliance status check error:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  static async generateComplianceReport(startDate, endDate) {
    try {
      const suspiciousUsersResult = await db.query(
        `SELECT COUNT(DISTINCT user_id) as suspicious_users, COUNT(*) as total_flags
         FROM cheat_detection
         WHERE risk_level IN ('HIGH', 'CONFIRMED')
         AND created_at BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      const sarsResult = await db.query(
        `SELECT COUNT(*) as total_sars
         FROM compliance_audit
         WHERE audit_type = 'aml' AND status = 'flagged'
         AND created_at BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      const largeTransactionsResult = await db.query(
        `SELECT COUNT(*) as total, SUM(amount) as total_amount
         FROM deposit_withdrawals
         WHERE amount >= 10000
         AND created_at BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        period: { startDate, endDate },
        suspiciousActivity: suspiciousUsersResult.rows[0],
        sars: sarsResult.rows[0],
        largeTransactions: largeTransactionsResult.rows[0],
      };
    } catch (error) {
      logger.error('Compliance report generation error:', error);
      throw error;
    }
  }
}

module.exports = ComplianceService;
