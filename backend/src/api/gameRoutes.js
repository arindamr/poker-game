/**
 * Game Routes with Anti-Cheat Integration - Phase 5
 * Integrates anti-cheat detection and compliance checks into game endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const PokerEngine = require('../game/engine');
const config = require('../config/env');
const antiCheatEngine = require('../game/antiCheatEngine');
const complianceService = require('../utils/complianceService');
const rateLimiter = require('../middleware/enhancedRateLimiter');
const { authenticateToken } = require('./middleware/authMiddleware');

// In-memory engine instances per game table
const activeEngines = new Map();

const buildPlayers = (rows) => rows.map((row) => ({
  id: row.user_id,
  stack: Number(row.stack),
  seat: row.position,
}));

const getEngineForGame = async (gameId) => {
  const existing = activeEngines.get(gameId);
  if (existing) {
    return existing;
  }

  const playersResult = await db.query(
    'SELECT user_id, stack, position FROM game_players WHERE game_id = $1 ORDER BY position',
    [gameId]
  );

  const players = buildPlayers(playersResult.rows);
  if (players.length === 0) {
    throw new Error('No players available to start game');
  }

  const tableResult = await db.query(
    'SELECT small_blind, big_blind FROM game_tables WHERE id = $1',
    [gameId]
  );

  const table = tableResult.rows[0] || {};
  const smallBlind = Number(table.small_blind ?? config.game.smallBlind);
  const bigBlind = Number(table.big_blind ?? config.game.bigBlind);

  const engine = new PokerEngine(gameId, gameId, players, smallBlind, bigBlind);
  await engine.startHand();
  activeEngines.set(gameId, engine);
  return engine;
};
const logger = require('../utils/logger');
const monitoringService = require('../monitoring/monitoringService');

/**
 * Create Game Table
 */
router.post('/tables', authenticateToken, rateLimiter.middleware({ maxAttempts: 20, windowMs: 60000, endpoint: 'create_table' }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { blinds, buyIn, maxPlayers } = req.body;
    const smallBlind = Number(blinds?.small ?? config.game.smallBlind ?? 1);
    const bigBlind = Number(blinds?.big ?? Math.max(smallBlind * 2, smallBlind + 1));
    const tableBuyIn = Number(buyIn ?? 0);
    const seatCount = Number(maxPlayers ?? 6);
    const minBuyIn = Math.max(tableBuyIn, 1);
    const maxBuyIn = Math.max(minBuyIn, tableBuyIn * 10 || minBuyIn);
    const tableName = `Table ${Date.now()}`;

    // Check if user is suspended or banned
    const userStatus = await db.query(
      'SELECT is_suspended, is_banned FROM users WHERE id = $1',
      [userId]
    );

    if (userStatus.rows[0]?.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    if (userStatus.rows[0]?.is_suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Verify user has sufficient balance
    const user = await db.query('SELECT account_balance FROM users WHERE id = $1', [userId]);
    if (Number(user.rows[0].account_balance) < tableBuyIn) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create game table
    const gameResult = await db.query(
      `INSERT INTO game_tables (
         name,
         small_blind,
         big_blind,
         min_buy_in,
         max_buy_in,
         max_seats,
         created_by,
         creator_id,
         blinds,
         buy_in,
         max_players,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $6, 'waiting')
       RETURNING id, blinds, buy_in, max_players`,
      [tableName, smallBlind, bigBlind, minBuyIn, maxBuyIn, seatCount, userId, JSON.stringify(blinds || { small: smallBlind, big: bigBlind }), tableBuyIn]
    );

    const gameId = gameResult.rows[0].id;

    // Add creator as first player
    await db.query(
      'INSERT INTO game_players (game_id, user_id, stack, position) VALUES ($1, $2, $3, $4)',
      [gameId, userId, tableBuyIn, 0]
    );

    logger.info(`Game table created: ${gameId} by user ${userId}`);
    monitoringService.recordMetric('game.tables_created', 1);

    res.status(201).json({
      gameId,
      blinds: blinds || { small: smallBlind, big: bigBlind },
      buyIn: tableBuyIn,
      maxPlayers: seatCount,
      status: 'waiting',
    });
  } catch (error) {
    logger.error('Create game error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

/**
 * Join Game Table
 */
router.post('/tables/:gameId/join', authenticateToken, rateLimiter.middleware({ maxAttempts: 50, windowMs: 60000, endpoint: 'join_table' }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameId } = req.params;
    const { buyIn } = req.body;

    // Check if user is suspended or banned
    const userStatus = await db.query(
      'SELECT is_suspended, is_banned FROM users WHERE id = $1',
      [userId]
    );

    if (userStatus.rows[0]?.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }

    if (userStatus.rows[0]?.is_suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Get game info
    const game = await db.query('SELECT * FROM game_tables WHERE id = $1', [gameId]);

    if (!game.rows[0]) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.rows[0].status !== 'waiting') {
      return res.status(400).json({ error: 'Game is not accepting players' });
    }

    // Check player count
    const playerCount = await db.query('SELECT COUNT(*) FROM game_players WHERE game_id = $1', [gameId]);
    if (Number(playerCount.rows[0].count) >= Number(game.rows[0].max_players || game.rows[0].max_seats || 0)) {
      return res.status(400).json({ error: 'Game is full' });
    }

    // Verify sufficient balance
    const user = await db.query('SELECT account_balance FROM users WHERE id = $1', [userId]);
    if (user.rows[0].account_balance < buyIn) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Check for multi-account cheating
    const multiAccountRisk = await antiCheatEngine.detectMultiAccount(userId);
    if (multiAccountRisk.score > 0.7) {
      logger.warn(`Multi-account detection: user ${userId}, risk ${multiAccountRisk.score}`);

      await db.query(
        `INSERT INTO cheat_detection 
         (user_id, game_id, suspicion_type, risk_score) 
         VALUES ($1, $2, $3, $4)`,
        [userId, gameId, 'multi_account', multiAccountRisk.score]
      );

      if (multiAccountRisk.score > 0.85) {
        await db.query('UPDATE users SET is_banned = true WHERE id = $1', [userId]);
        return res.status(403).json({ error: 'Account banned' });
      }
    }

    // Add player to game
    const position = Number(playerCount.rows[0].count);
    await db.query(
      'INSERT INTO game_players (game_id, user_id, stack, position) VALUES ($1, $2, $3, $4)',
      [gameId, userId, buyIn, position]
    );

    // Deduct buy-in from user balance
    await db.query('UPDATE users SET account_balance = account_balance - $1 WHERE id = $2', [buyIn, userId]);

    logger.info(`User ${userId} joined game ${gameId}`);
    monitoringService.recordMetric('game.players_joined', 1);

    res.json({
      message: 'Joined game successfully',
      gameId,
      position,
      stack: buyIn,
    });
  } catch (error) {
    logger.error('Join game error:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

/**
 * Player Action (Bet, Check, Fold, etc.)
 */
router.post('/tables/:gameId/action', authenticateToken, gameValidation.action, rateLimiter.middleware({ maxAttempts: 100, windowMs: 10000, endpoint: 'table_action' }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameId } = req.params;
    const { action, amount } = req.body;
    const actionTime = Date.now();

    // Record action start time for RTA detection
    const sessionStart = req.session?.actionStart || actionTime;
    const timeSinceLastAction = actionTime - sessionStart;

    // **Anti-Cheat: RTA Detection**
    const rtaRisk = await antiCheatEngine.detectRTA(gameId, userId, timeSinceLastAction);

    if (rtaRisk.score > 0.7) {
      logger.warn(`RTA suspicion: user ${userId}, game ${gameId}, risk ${rtaRisk.score}`);

      await db.query(
        `INSERT INTO cheat_detection 
         (user_id, game_id, suspicion_type, risk_score, details) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, gameId, 'rta', rtaRisk.score, JSON.stringify({ timeSinceLastAction, action })]
      );

      if (rtaRisk.score > 0.85) {
        return res.status(403).json({ error: 'Action flagged as suspicious' });
      }
    }

    // Verify user is in game
    const player = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );

    if (!player.rows[0]) {
      return res.status(404).json({ error: 'Player not in game' });
    }

    // Process action
    const engine = await getEngineForGame(gameId);
    const result = await engine.processPlayerAction(userId, action, amount);

    // **Compliance: Check for unusual betting patterns**
    if (amount && amount > 10000) {
      const amlCheck = await complianceService.monitorTransaction(userId, amount, 'bet');
      if (amlCheck.suspicious) {
        logger.warn(`Suspicious bet amount: user ${userId}, amount ${amount}`);
      }
    }

    // Update last action time
    if (req.session) {
      req.session.actionStart = actionTime;
    }

    // Record metrics
    monitoringService.recordMetric('game.actions', 1);
    monitoringService.recordMetric('game.action_duration', timeSinceLastAction);

    logger.info(`Action processed: user ${userId}, game ${gameId}, action ${action}`);

    res.json({
      action,
      amount,
      gameState: result.state,
      pot: result.pot,
    });
  } catch (error) {
    logger.error('Action processing error:', error);
    res.status(500).json({ error: 'Failed to process action' });
  }
});

/**
 * Get Game State
 */
router.get('/tables/:gameId/state', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await db.query('SELECT * FROM game_tables WHERE id = $1', [gameId]);

    if (!game.rows[0]) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const players = await db.query(
      'SELECT user_id, stack, position FROM game_players WHERE game_id = $1 ORDER BY position',
      [gameId]
    );

    res.json({
      gameId,
      state: game.rows[0].state,
      pot: game.rows[0].pot,
      dealers: game.rows[0].dealer_position,
      players: players.rows,
    });
  } catch (error) {
    logger.error('Get game state error:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

/**
 * Verify Shuffle (called before game starts)
 */
router.post('/tables/:gameId/verify-shuffle', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { seed, deck } = req.body;

    // **Anti-Cheat: Shuffle Verification**
    const shuffleResult = await antiCheatEngine.verifyShuffle(gameId, seed, deck);

    if (!shuffleResult.verified) {
      logger.error(`Invalid shuffle detected: game ${gameId}`);

      // Record cheat detection
      await db.query(
        `INSERT INTO cheat_detection 
         (game_id, suspicion_type, risk_score) 
         VALUES ($1, $2, $3)`,
        [gameId, 'invalid_shuffle', 0.95]
      );

      // Suspend game
      await db.query('UPDATE game_tables SET status = $1 WHERE id = $2', ['suspended', gameId]);

      return res.status(403).json({ error: 'Invalid shuffle detected' });
    }

    res.json({ valid: true });
  } catch (error) {
    logger.error('Shuffle verification error:', error);
    res.status(500).json({ error: 'Failed to verify shuffle' });
  }
});

/**
 * End Game / Cash Out
 */
router.post('/tables/:gameId/cash-out', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameId } = req.params;
    const { winnings } = req.body;

    // Get player info
    const player = await db.query(
      'SELECT stack FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );

    if (!player.rows[0]) {
      return res.status(404).json({ error: 'Player not in game' });
    }

    const finalStack = player.rows[0].stack;

    // **Compliance: Monitor large winnings**
    if (finalStack > 50000) {
      const amlCheck = await complianceService.monitorTransaction(userId, finalStack, 'withdrawal');

      if (amlCheck.suspicious) {
        logger.warn(`Large withdrawal: user ${userId}, amount ${finalStack}`);

        // Create SAR
        await complianceService.createSAR(userId, {
          type: 'large_winnings',
          amount: finalStack,
          reason: 'Large poker winnings',
        });
      }
    }

    // Credit winnings to user balance
    await db.query(
      'UPDATE users SET account_balance = account_balance + $1 WHERE id = $2',
      [finalStack, userId]
    );

    // Remove player from game
    await db.query(
      'DELETE FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );

    logger.info(`User ${userId} cashed out from game ${gameId}: ${finalStack}`);
    monitoringService.recordMetric('financial.winnings_paid', finalStack);

    res.json({
      message: 'Cashed out successfully',
      finalStack,
      newBalance: finalStack,
    });
  } catch (error) {
    logger.error('Cash out error:', error);
    res.status(500).json({ error: 'Failed to cash out' });
  }
});

/**
 * Get Hand History
 */
router.get('/tables/:gameId/history', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;

    const history = await db.query(
      'SELECT * FROM hand_history WHERE game_id = $1 ORDER BY created_at DESC',
      [gameId]
    );

    res.json({
      gameId,
      hands: history.rows,
    });
  } catch (error) {
    logger.error('Get hand history error:', error);
    res.status(500).json({ error: 'Failed to get hand history' });
  }
});

module.exports = router;
