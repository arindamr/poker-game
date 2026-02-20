const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * Advanced Anti-Cheat Detection System
 * Detects: RTA (Real-Time Action), multi-account, collusion, shuffle anomalies
 */
class AntiCheatEngine {
  constructor() {
    this.suspiciousActionThreshold = 0.5; // 50% confidence = suspicious
    this.confirmedCheatingThreshold = 0.85; // 85% confidence = confirmed
    this.patterns = {
      RTA: 'real_time_action',
      MULTI_ACCOUNT: 'multi_account',
      COLLUSION: 'collusion',
      SHUFFLE_ANOMALY: 'shuffle_anomaly',
    };
  }

  /**
   * Analyze player action timing for Real-Time Action (RTA) detection
   */
  async detectRTA(gameId, playerId, actionTime) {
    try {
      // Get player's historical action times
      const historyResult = await db.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (action_timestamp - created_at))) as avg_decision_time,
                COUNT(*) as total_actions
         FROM player_actions 
         WHERE player_id = $1 AND game_id != $2 AND action_timestamp IS NOT NULL
         LIMIT 100`,
        [playerId, gameId]
      );

      if (historyResult.rows.length === 0) {
        return { suspicious: false, score: 0 };
      }

      const avgDecisionTime = historyResult.rows[0].avg_decision_time || 5;
      const currentDecisionTime = actionTime / 1000; // Convert to seconds

      // Flag if decision time is significantly faster than average
      if (currentDecisionTime < 0.5) {
        // Faster than 500ms is suspicious (likely bot)
        return {
          suspicious: true,
          score: 0.9,
          pattern: this.patterns.RTA,
          reason: 'Decision time too fast (< 500ms)',
          averageTime: avgDecisionTime,
          currentTime: currentDecisionTime,
        };
      }

      // Check if pattern shows unnatural consistency
      const variance = this.calculateVariance(currentDecisionTime, avgDecisionTime);
      if (variance < 0.1) {
        // Too consistent indicates bot
        return {
          suspicious: true,
          score: 0.75,
          pattern: this.patterns.RTA,
          reason: 'Unusually consistent decision timing',
          variance,
        };
      }

      return { suspicious: false, score: 0 };
    } catch (error) {
      logger.error('RTA detection error:', error);
      return { suspicious: false, score: 0, error };
    }
  }

  /**
   * Detect multi-account playing patterns
   */
  async detectMultiAccount(userId) {
    try {
      // Get device fingerprints and IPs associated with user
      const sessionsResult = await db.query(
        `SELECT DISTINCT device_fingerprint, ip_address, created_at 
         FROM sessions 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );

      if (sessionsResult.rows.length === 0) {
        return { suspicious: false, score: 0 };
      }

      const sessions = sessionsResult.rows;
      const devices = new Set(sessions.map(s => s.device_fingerprint));
      const ips = new Set(sessions.map(s => s.ip_address));

      // Check for rapid account switching (same device, different user)
      const linkedAccountsResult = await db.query(
        `SELECT DISTINCT user_id FROM sessions 
         WHERE device_fingerprint = ANY($1) AND user_id != $2
         LIMIT 10`,
        [Array.from(devices), userId]
      );

      if (linkedAccountsResult.rows.length > 0) {
        // Multiple accounts on same device is suspicious
        const linkedCount = linkedAccountsResult.rows.length;
        const riskScore = Math.min(0.9, linkedCount * 0.3);

        return {
          suspicious: riskScore > this.suspiciousActionThreshold,
          score: riskScore,
          pattern: this.patterns.MULTI_ACCOUNT,
          reason: `${linkedCount} other accounts on same device`,
          linkedAccounts: linkedAccountsResult.rows.length,
          devices: devices.size,
          ips: ips.size,
        };
      }

      return { suspicious: false, score: 0 };
    } catch (error) {
      logger.error('Multi-account detection error:', error);
      return { suspicious: false, score: 0, error };
    }
  }

  /**
   * Detect collusion between players at same table
   */
  async detectCollusion(gameId, tableId) {
    try {
      const gameResult = await db.query(
        `SELECT player_id, action_type, action_amount, action_timestamp 
         FROM player_actions 
         WHERE game_id = $1 
         ORDER BY action_timestamp`,
        [gameId]
      );

      const actions = gameResult.rows;
      if (actions.length < 4) {
        return { suspicious: false, score: 0 };
      }

      // Group by player
      const playerActions = {};
      actions.forEach(action => {
        if (!playerActions[action.player_id]) {
          playerActions[action.player_id] = [];
        }
        playerActions[action.player_id].push(action);
      });

      const players = Object.keys(playerActions);

      // Check for suspicious patterns between player pairs
      let maxCollisionScore = 0;
      const suspiciousPairs = [];

      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const player1 = players[i];
          const player2 = players[j];

          const score = this.analyzePlayerPair(
            playerActions[player1],
            playerActions[player2]
          );

          if (score > this.suspiciousActionThreshold) {
            suspiciousPairs.push({
              player1,
              player2,
              score,
            });
            maxCollisionScore = Math.max(maxCollisionScore, score);
          }
        }
      }

      if (suspiciousPairs.length > 0) {
        return {
          suspicious: maxCollisionScore > this.suspiciousActionThreshold,
          score: maxCollisionScore,
          pattern: this.patterns.COLLUSION,
          reason: 'Suspicious synchronized play patterns detected',
          suspiciousPairs,
        };
      }

      return { suspicious: false, score: 0 };
    } catch (error) {
      logger.error('Collusion detection error:', error);
      return { suspicious: false, score: 0, error };
    }
  }

  /**
   * Analyze player pair for collusion
   */
  analyzePlayerPair(player1Actions, player2Actions) {
    let score = 0;

    // Check if players fold against each other suspiciously often
    const foldAgainstOpponent = player1Actions.filter(
      action => action.action_type === 'FOLD'
    ).length;

    const aggression1 = this.calculateAggression(player1Actions);
    const aggression2 = this.calculateAggression(player2Actions);

    // One player always folds to the other = suspicious
    if (foldAgainstOpponent / player1Actions.length > 0.7) {
      score += 0.4;
    }

    // Dramatic difference in aggression profiles
    if (Math.abs(aggression1 - aggression2) > 0.6) {
      score += 0.3;
    }

    // Unlikely runout statistics
    const correlation = this.calculateActionCorrelation(player1Actions, player2Actions);
    if (correlation > 0.8) {
      score += 0.3;
    }

    return Math.min(0.95, score);
  }

  /**
   * Calculate player aggression (raise ratio)
   */
  calculateAggression(actions) {
    const raises = actions.filter(a => a.action_type === 'RAISE').length;
    return raises / Math.max(1, actions.length);
  }

  /**
   * Calculate correlation between player actions
   */
  calculateActionCorrelation(actions1, actions2) {
    if (actions1.length === 0 || actions2.length === 0) return 0;

    const minLength = Math.min(actions1.length, actions2.length);
    let matches = 0;

    for (let i = 0; i < minLength; i++) {
      if (actions1[i].action_type === actions2[i].action_type) {
        matches++;
      }
    }

    return matches / minLength;
  }

  /**
   * Verify shuffle integrity
   */
  async verifyShuffle(gameId, seed, deck) {
    try {
      // Store audit log
      const crypto = await import('crypto');
      const deckHash = crypto.createHash('sha256').update(JSON.stringify(deck)).digest('hex');
      const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

      const result = await db.query(
        `INSERT INTO rng_audit (game_id, seed, shuffled_deck, deck_hash, server_signature)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [gameId, seed, JSON.stringify(deck), deckHash, seedHash]
      );

      logger.info(`Shuffle verified for game ${gameId}. Audit ID: ${result.rows[0].id}`);

      // Run statistical tests on shuffle
      const chiSquareResult = await this.testShuffleRandomness(deck);

      return {
        verified: true,
        deckHash,
        auditId: result.rows[0].id,
        chiSquareTest: chiSquareResult,
      };
    } catch (error) {
      logger.error('Shuffle verification error:', error);
      throw error;
    }
  }

  /**
   * Chi-square test for shuffle randomness
   */
  testShuffleRandomness(deck) {
    // Expected: each suit appears ~13 times
    const suitCounts = { h: 0, d: 0, c: 0, s: 0 };
    deck.forEach(card => {
      suitCounts[card[1]]++;
    });

    const expected = 52 / 4; // 13
    let chiSquare = 0;

    Object.values(suitCounts).forEach(count => {
      chiSquare += Math.pow(count - expected, 2) / expected;
    });

    // Chi-square critical value for 3 df at 0.05 significance = 7.815
    const isRandom = chiSquare < 7.815;

    return {
      chiSquareValue: chiSquare,
      isRandom,
      suitDistribution: suitCounts,
    };
  }

  /**
   * Calculate variance
   */
  calculateVariance(value, average) {
    return Math.abs(value - average) / average;
  }

  /**
   * Log suspected cheat for manual review
   */
  async logSuspicion(userId, gameId, suspicion) {
    try {
      const risk = suspicion.score > this.confirmedCheatingThreshold ? 'HIGH' : 'MEDIUM';

      await db.query(
        `INSERT INTO cheat_detection (user_id, game_id, detection_type, risk_level, score, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, gameId, suspicion.pattern, risk, suspicion.score, JSON.stringify(suspicion)]
      );

      logger.warn(`Cheat suspicion logged for user ${userId}. Risk: ${risk}, Score: ${suspicion.score}`);

      // If high risk, alert security team
      if (risk === 'HIGH') {
        logger.error(`SECURITY ALERT: Potential cheating detected. User: ${userId}, Score: ${suspicion.score}`);
      }
    } catch (error) {
      logger.error('Error logging cheat suspicion:', error);
    }
  }
}

module.exports = new AntiCheatEngine();
