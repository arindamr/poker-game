const express = require('express');
const { param, body, query } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/inputValidation');
const {
  getAllTables,
  deleteTable,
  getCheatDetections,
  getUserCheatHistory,
  reviewCheatSuspicion,
  banUser
} = require('../controllers/adminController');

const router = express.Router();

const validateUserId = [param('userId').isUUID().withMessage('Invalid user ID'), validate];

router.use(authenticateToken);
router.use(requireAdmin);

// Table management
router.get('/tables', getAllTables);
router.delete('/tables/:tableId', deleteTable);

// Phase 5: Anti-cheat management
router.get('/cheat-detections', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  validate,
], getCheatDetections);
router.get('/cheat-detections/:userId', validateUserId, getUserCheatHistory);
router.post('/cheat-suspicions/:userId/review', validateUserId, [
  body('status').isIn(['dismissed', 'confirmed']).withMessage('Status must be dismissed or confirmed'),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
  validate,
], reviewCheatSuspicion);
router.post('/cheat-suspicions/:userId/ban', validateUserId, [
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  validate,
], banUser);

module.exports = router;
