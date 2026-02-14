const express = require('express');
const {
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
} = require('../controllers/tableController');
const { authenticateToken, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Get all tables (public)
router.get('/', optionalAuth, getTables);

// Create table (requires auth)
router.post('/', authenticateToken, createTable);

// Delete table (requires auth, creator only)
router.delete('/:tableId', authenticateToken, deleteTable);

// Add bot players (requires auth)
router.post('/:tableId/bots', authenticateToken, addBots);
// Remove a bot by seat (requires auth)
router.delete('/:tableId/bots', authenticateToken, removeBot);
// Player action (requires auth) - bots respond automatically
router.post('/:tableId/action', authenticateToken, playerAction);
// Current game state snapshot (requires auth)
router.get('/:tableId/state', authenticateToken, getGameState);

// Table details (public)
router.get('/:tableId', optionalAuth, getTableDetails);

// Join table (requires auth)
router.post('/:tableId/join', authenticateToken, joinTable);

// Leave table (requires auth)
router.delete('/:tableId/leave', authenticateToken, leaveTable);

// Get seat availability (public)
router.get('/:tableId/seats', optionalAuth, getSeats);

module.exports = router;
