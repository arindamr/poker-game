const GameTable = require('../../models/GameTable');
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

  // TODO: Add seat assignment logic
  logger.info('Player joined table', { userId, tableId });

  res.json({
    success: true,
    message: 'Joined table successfully',
  });
});

/**
 * Leave table
 */
const leaveTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const userId = req.user.sub;

  logger.info('Player left table', { userId, tableId });

  res.json({
    success: true,
    message: 'Left table successfully',
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

  const availableSeats = table.max_seats - table.current_players;

  res.json({
    success: true,
    seats: {
      total: table.max_seats,
      available: availableSeats,
      occupied: table.current_players,
    },
  });
});

module.exports = {
  getTables,
  createTable,
  getTableDetails,
  joinTable,
  leaveTable,
  getSeats,
};
