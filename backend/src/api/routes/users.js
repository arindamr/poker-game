const express = require('express');
const {
  getUserProfile,
  updateUserProfile,
  getBalance,
  deposit,
  withdraw,
} = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// User profile
router.get('/:userId', getUserProfile);
router.put('/:userId', updateUserProfile);

// Balance
router.get('/:userId/balance', getBalance);
router.post('/:userId/deposit', deposit);
router.post('/:userId/withdraw', withdraw);

module.exports = router;
