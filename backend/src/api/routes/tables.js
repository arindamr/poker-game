const express = require('express');
const {
  getTables,
  createTable,
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

// Table details (public)
router.get('/:tableId', optionalAuth, getTableDetails);

// Join table (requires auth)
router.post('/:tableId/join', authenticateToken, joinTable);

// Leave table (requires auth)
router.delete('/:tableId/leave', authenticateToken, leaveTable);

// Get seat availability (public)
router.get('/:tableId/seats', optionalAuth, getSeats);

module.exports = router;
