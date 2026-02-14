const GameTable = require('../../models/GameTable');
const db = require('../../config/database');
const { hashPassword, generateRandomToken } = require('../../utils/crypto');
const { getEngine, resetEngine } = require('../../game/engineManager');
const { decideBotAction } = require('../../game/botStrategy');
const { ACTION } = require('../../game/gameState');
const { getIO } = require('../../websocket/io');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateTableCreation } = require('../../utils/validators');
const logger = require('../../utils/logger');

/**
 * Get all active tables
 */
const getTables = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  const tables = await GameTable.getActive(
    Math.min(parseInt(limit, 10), 100),
    parseInt(offset, 10),
  );

  res.json({
    success: true,
    tables,
    count: tables.length,
  });
});

/**
 * Create a new table
 */
const createTable = asyncHandler(async (req, res) => {
  const { error, value } = validateTableCreation(req.body);

  if (error) {
    logger.warn('Table creation validation error', { error: error.message });
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    });
  }

  const {
    name,
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    maxSeats,
  } = value;

  const table = await GameTable.create(
    name,
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    maxSeats,
    req.user.sub,
  );

  logger.info('Table created', { tableId: table.id, createdBy: req.user.sub });

  res.status(201).json({
    success: true,
    message: 'Table created successfully',
    table,
  });
});

/**
 * Delete a table (creator only)
 */
const deleteTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const userId = req.user.sub;

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  if (table.created_by !== userId) {
    return res.status(403).json({
      success: false,
      error: 'Only the table creator can delete this table',
    });
  }

  await GameTable.delete(tableId);
  logger.info('Table deleted', { tableId, deletedBy: userId });

  res.json({
    success: true,
    message: 'Table deleted successfully',
  });
});

/**
 * Get table details
 */
const getTableDetails = asyncHandler(async (req, res) => {
  const { tableId } = req.params;

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  res.json({
    success: true,
    table,
  });
});

/**
 * Join table
 */
const joinTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const userId = req.user.sub;

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  if (table.current_players >= table.max_seats) {
    return res.status(400).json({
      success: false,
      error: 'Table is full',
    });
  }

  const result = await db.transaction(async (client) => {
    const existingSeat = await client.query(
      'SELECT position FROM table_seats WHERE table_id = $1 AND player_id = $2 AND is_seated = true',
      [tableId, userId],
    );

    if (existingSeat.rows[0]) {
      return { position: existingSeat.rows[0].position, alreadySeated: true };
    }

    const occupiedRows = await client.query(
      'SELECT position FROM table_seats WHERE table_id = $1 AND is_seated = true ORDER BY position',
      [tableId],
    );
    const occupied = new Set(occupiedRows.rows.map((row) => row.position));

    let seatPosition = null;
    for (let i = 0; i < table.max_seats; i++) {
      if (!occupied.has(i)) {
        seatPosition = i;
        break;
      }
    }

    if (seatPosition === null) {
      throw new Error('Table is full');
    }

    await client.query(
      `INSERT INTO table_seats (table_id, player_id, position, stack, is_seated, joined_at)
       VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
       ON CONFLICT (table_id, position)
       DO UPDATE SET player_id = EXCLUDED.player_id,
                     stack = EXCLUDED.stack,
                     is_seated = true,
                     joined_at = EXCLUDED.joined_at`,
      [tableId, userId, seatPosition, table.min_buy_in],
    );

    const countRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM table_seats WHERE table_id = $1 AND is_seated = true',
      [tableId],
    );
    const seatedCount = countRes.rows[0]?.count || 0;

    await client.query(
      'UPDATE game_tables SET current_players = $1 WHERE id = $2',
      [seatedCount, tableId],
    );

    return { position: seatPosition, alreadySeated: false, seatedCount };
  });

  resetEngine(tableId);
  logger.info('Player joined table', { userId, tableId, position: result.position });

  res.json({
    success: true,
    message: 'Joined table successfully',
    seat: result.position,
    alreadySeated: result.alreadySeated,
  });
});

const insertBotUser = async (client) => {
  const suffix = generateRandomToken(6);
  const username = `BOT_${suffix}`;
  const email = `bot+${suffix}@poker.local`;
  const passwordHash = await hashPassword(generateRandomToken(12));
  const result = await client.query(
    `INSERT INTO users (username, email, password_hash, ip_address)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email`,
    [username, email, passwordHash, '127.0.0.1'],
  );
  return result.rows[0];
};

/**
 * Add bot players (max 5 per table)
 */
const addBots = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const count = Math.max(1, Math.min(5, parseInt(req.body?.count, 10) || 1));

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  const result = await db.transaction(async (client) => {
    const botCountRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM table_seats ts
       JOIN users u ON u.id = ts.player_id
       WHERE ts.table_id = $1 AND ts.is_seated = true AND u.username LIKE 'BOT_%'`,
      [tableId],
    );
    const existingBots = botCountRes.rows[0]?.count || 0;
    const remainingBots = Math.max(0, 5 - existingBots);
    const botsToAdd = Math.min(count, remainingBots);

    if (botsToAdd === 0) {
      return { added: 0 };
    }

    const occupiedRows = await client.query(
      'SELECT position FROM table_seats WHERE table_id = $1 AND is_seated = true ORDER BY position',
      [tableId],
    );
    const occupied = new Set(occupiedRows.rows.map((row) => row.position));

    const openSeats = [];
    for (let i = 0; i < table.max_seats; i++) {
      if (!occupied.has(i)) {
        openSeats.push(i);
      }
    }

    const seatsToFill = Math.min(openSeats.length, botsToAdd);
    for (let i = 0; i < seatsToFill; i++) {
      const bot = await insertBotUser(client);
      const seatPosition = openSeats[i];

      await client.query(
        `INSERT INTO table_seats (table_id, player_id, position, stack, is_seated, joined_at)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
         ON CONFLICT (table_id, position)
         DO UPDATE SET player_id = EXCLUDED.player_id,
                       stack = EXCLUDED.stack,
                       is_seated = true,
                       joined_at = EXCLUDED.joined_at`,
        [tableId, bot.id, seatPosition, table.min_buy_in],
      );
    }

    const countRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM table_seats WHERE table_id = $1 AND is_seated = true',
      [tableId],
    );
    const seatedCount = countRes.rows[0]?.count || 0;

    await client.query(
      'UPDATE game_tables SET current_players = $1 WHERE id = $2',
      [seatedCount, tableId],
    );

    return { added: seatsToFill };
  });

  res.json({
    success: true,
    added: result.added,
  });
});

/**
 * Remove a bot from a seat (requires auth)
 */
const removeBot = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const seatPosition = Number(req.body?.seatPosition);

  if (Number.isNaN(seatPosition)) {
    return res.status(400).json({
      success: false,
      error: 'seatPosition is required',
    });
  }

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  await db.transaction(async (client) => {
    const seatRes = await client.query(
      `SELECT ts.player_id, u.username
       FROM table_seats ts
       JOIN users u ON u.id = ts.player_id
       WHERE ts.table_id = $1 AND ts.position = $2 AND ts.is_seated = true`,
      [tableId, seatPosition],
    );

    if (!seatRes.rows[0]) {
      throw new Error('Seat is empty');
    }

    const { player_id: playerId, username } = seatRes.rows[0];
    if (!username.startsWith('BOT_')) {
      throw new Error('Selected seat is not a bot');
    }

    await client.query(
      `UPDATE table_seats
       SET player_id = NULL, stack = NULL, is_seated = false, joined_at = NULL
       WHERE table_id = $1 AND position = $2`,
      [tableId, seatPosition],
    );

    await client.query('DELETE FROM users WHERE id = $1', [playerId]);

    const countRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM table_seats WHERE table_id = $1 AND is_seated = true',
      [tableId],
    );
    const seatedCount = countRes.rows[0]?.count || 0;

    await client.query(
      'UPDATE game_tables SET current_players = $1 WHERE id = $2',
      [seatedCount, tableId],
    );
  });

  res.json({
    success: true,
    message: 'Bot removed',
  });
});

/**
 * Leave table
 */
const leaveTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const userId = req.user.sub;

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE table_seats
       SET player_id = NULL, stack = NULL, is_seated = false, joined_at = NULL
       WHERE table_id = $1 AND player_id = $2 AND is_seated = true`,
      [tableId, userId],
    );

    const countRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM table_seats WHERE table_id = $1 AND is_seated = true',
      [tableId],
    );
    const seatedCount = countRes.rows[0]?.count || 0;

    await client.query(
      'UPDATE game_tables SET current_players = $1 WHERE id = $2',
      [seatedCount, tableId],
    );
  });

  resetEngine(tableId);
  logger.info('Player left table', { userId, tableId });

  res.json({
    success: true,
    message: 'Left table successfully',
  });
});

/**
 * Process a player action and let bots respond
 */
const playerAction = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const userId = req.user.sub;
  const { action, amount = 0 } = req.body || {};

  const actionKey = (action || '').toString().toUpperCase();
  if (!Object.values(ACTION).includes(actionKey)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid action',
    });
  }

  const seat = await db.getOne(
    'SELECT position FROM table_seats WHERE table_id = $1 AND player_id = $2 AND is_seated = true',
    [tableId, userId],
  );
  if (!seat) {
    return res.status(403).json({
      success: false,
      error: 'Player is not seated at this table',
    });
  }

  const engine = await getEngine(tableId);
  const numericAmount = Number(amount) || 0;
  const result = await engine.processPlayerAction(userId, actionKey, numericAmount);

  const botActions = [];
  if (!engine.isCompleted()) {
    // Bot responses (after human action only). Only act when it's a bot's turn.
    const botRows = await db.getAll(
      `SELECT ts.player_id, u.username
       FROM table_seats ts
       JOIN users u ON u.id = ts.player_id
       WHERE ts.table_id = $1 AND ts.is_seated = true AND u.username LIKE 'BOT_%'
       ORDER BY ts.position`,
      [tableId],
    );
    const botIds = new Set(botRows.map((row) => row.player_id));

    let guard = 0;
    let gameState = engine.getGameState();
    while (!engine.isCompleted() && gameState.currentActorId && botIds.has(gameState.currentActorId)) {
      if (guard++ > 10) break; // safety guard per request
      const player = gameState.players.find((p) => p.id === gameState.currentActorId);
      if (!player || player.folded) {
        break;
      }
      const decision = decideBotAction(gameState, player, engine.stateMachine.bigBlind || 0);
      try {
        await engine.processPlayerAction(player.id, decision.action, decision.amount || 0);
        botActions.push({ playerId: player.id, action: decision.action, amount: decision.amount || 0 });
        gameState = engine.getGameState();
      } catch (error) {
        break;
      }
    }
  }

  if (engine.isCompleted()) {
    resetEngine(tableId);
  }

  const io = getIO();
  if (io) {
    io.to(`table:${tableId}`).emit('GAME_STATE_UPDATE', {
      tableId,
      state: engine.getGameState(),
    });
    io.to(`table:${tableId}`).emit('PLAYER_ACTION_BROADCAST', {
      playerId: userId,
      action: actionKey,
      amount: numericAmount,
      timestamp: new Date().toISOString(),
    });
    if (botActions.length > 0) {
      io.to(`table:${tableId}`).emit('BOT_ACTIONS', {
        tableId,
        actions: botActions,
      });
    }
  }

  res.json({
    success: true,
    state: engine.getGameState(),
    botActions,
  });
});

/**
 * Get current game state (engine snapshot)
 */
const getGameState = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const engine = await getEngine(tableId);
  res.json({
    success: true,
    state: engine.getGameState(),
  });
});

/**
 * Get seat availability
 */
const getSeats = asyncHandler(async (req, res) => {
  const { tableId } = req.params;

  const table = await GameTable.findById(tableId);
  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Table not found',
    });
  }

  const seatRows = await db.getAll(
    `SELECT ts.position, ts.player_id, u.username
     FROM table_seats ts
     JOIN users u ON u.id = ts.player_id
     WHERE ts.table_id = $1 AND ts.is_seated = true
     ORDER BY ts.position`,
    [tableId],
  );

  const occupiedCount = seatRows.length;
  const availableSeats = table.max_seats - occupiedCount;
  const seats = Array.from({ length: table.max_seats }).map((_, index) => {
    const row = seatRows.find((seat) => seat.position === index);
    return {
      position: index,
      occupied: !!row,
      playerId: row?.player_id || null,
      username: row?.username || null,
      isBot: row?.username?.startsWith('BOT_') || false,
    };
  });

  const userId = req.user?.sub;
  const yourSeat = userId
    ? seats.find((seat) => seat.playerId === userId)?.position ?? null
    : null;

  res.json({
    success: true,
    seats: {
      total: table.max_seats,
      available: availableSeats,
      occupied: occupiedCount,
      seats,
      yourSeat,
    },
  });
});

module.exports = {
  getTables,
  createTable,
  deleteTable,
  addBots,
  removeBot,
  playerAction,
  getGameState,
  getTableDetails,
  joinTable,
  leaveTable,
  getSeats,
};
