const User = require('../../models/User');
const Session = require('../../models/Session');
const {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateDeviceFingerprint,
} = require('../../utils/crypto');
const { validateRegister, validateLogin } = require('../../utils/validators');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

/**
 * Register a new user
 */
const register = asyncHandler(async (req, res) => {
  const { error, value } = validateRegister(req.body);

  if (error) {
    logger.warn('Registration validation error', { error: error.message });
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    });
  }

  const { username, email, password } = value;

  // Check if user exists
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    logger.warn('Registration attempt with existing email', { email });
    return res.status(409).json({
      success: false,
      error: 'Email already registered',
      code: 'EMAIL_EXISTS',
    });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const newUser = await User.create(username, email, passwordHash, req.ip);

  logger.info('User registered', { userId: newUser.id, email });

  // Issue tokens so the client is authenticated immediately after registration
  const tokenPayload = {
    sub: newUser.id,
    username: newUser.username,
    email: newUser.email,
  };
  const accessToken = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);
  const tokenHash = hashToken(accessToken);
  const deviceFingerprint = generateDeviceFingerprint(req);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await Session.create(
    newUser.id,
    tokenHash,
    deviceFingerprint,
    req.ip,
    req.headers['user-agent'],
    expiresAt,
  );
  await redis.set(`refresh_token:${newUser.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * Login user
 */
const login = asyncHandler(async (req, res) => {
  const { error, value } = validateLogin(req.body);

  if (error) {
    logger.warn('Login validation error', { error: error.message });
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    });
  }

  const { email, password } = value;

  // Find user
  const user = await User.findByEmail(email);
  if (!user) {
    logger.warn('Login attempt with non-existent email', { email });
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
    });
  }

  // Verify password
  const passwordMatch = await comparePassword(password, user.password_hash);
  if (!passwordMatch) {
    logger.warn('Login attempt with wrong password', { email });
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
    });
  }

  // Generate tokens
  const tokenPayload = {
    sub: user.id,
    username: user.username,
    email: user.email,
  };

  const accessToken = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);
  const tokenHash = hashToken(accessToken);

  // Device fingerprint
  const deviceFingerprint = generateDeviceFingerprint(req);

  // Create session
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await Session.create(
    user.id,
    tokenHash,
    deviceFingerprint,
    req.ip,
    req.headers['user-agent'],
    expiresAt,
  );

  // Record last login
  await User.recordLastLogin(user.id, req.ip);

  // Cache refresh token in Redis
  await redis.set(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

  logger.info('User logged in', { userId: user.id, email });

  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      accountBalance: user.account_balance,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * Refresh access token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token required',
    });
  }

  // Verify refresh token
  const payload = verifyRefreshToken(token);
  if (!payload) {
    logger.warn('Invalid refresh token attempt');
    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
    });
  }

  // Verify token is in Redis
  const cachedToken = await redis.get(`refresh_token:${payload.sub}`);
  if (cachedToken !== token) {
    logger.warn('Refresh token mismatch', { userId: payload.sub });
    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
    });
  }

  // Generate new access token
  const newAccessToken = generateToken({
    sub: payload.sub,
    username: payload.username,
    email: payload.email,
  });

  // Persist a session for the new token so authenticateToken can validate it
  const tokenHash = hashToken(newAccessToken);
  const deviceFingerprint = generateDeviceFingerprint(req);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await Session.create(
    payload.sub,
    tokenHash,
    deviceFingerprint,
    req.ip,
    req.headers['user-agent'],
    expiresAt,
  );

  logger.debug('Access token refreshed', { userId: payload.sub });

  res.json({
    success: true,
    accessToken: newAccessToken,
  });
});

/**
 * Logout user
 */
const logout = asyncHandler(async (req, res) => {
  const userId = req.user.sub;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const tokenHash = hashToken(token);
    // Invalidate session
    const session = await Session.findByTokenHash(tokenHash);
    if (session) {
      await Session.invalidate(session.id);
    }
  }

  // Remove refresh token from Redis
  await redis.del(`refresh_token:${userId}`);

  logger.info('User logged out', { userId });

  res.json({
    success: true,
    message: 'Logout successful',
  });
});

/**
 * Verify token
 */
const verifyTokenEndpoint = asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided',
    });
  }

  const userId = req.user.sub;

  res.json({
    success: true,
    user: {
      id: userId,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  verifyTokenEndpoint,
};
