const express = require('express');
const {
  register,
  login,
  refreshToken,
  logout,
  verifyTokenEndpoint,
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { loginLimiter, registrationLimiter } = require('../middleware/rateLimiter');
const { authValidation } = require('../../middleware/inputValidation');

const router = express.Router();

// Public routes
router.post('/register', registrationLimiter, authValidation.register, register);
router.post('/login', loginLimiter, authValidation.login, login);
router.post('/refresh', refreshToken);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.get('/verify', authenticateToken, verifyTokenEndpoint);

module.exports = router;
