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

const router = express.Router();

// Public routes
// Validation for register/login is handled in the controller via Joi
// (validators.js) — see TODO A4.
router.post('/register', registrationLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.get('/verify', authenticateToken, verifyTokenEndpoint);

module.exports = router;
