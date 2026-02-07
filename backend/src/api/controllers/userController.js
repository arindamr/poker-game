const User = require('../../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * Get user profile
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUserId = req.user.sub;

  // Only allow users to see their own profile (or admins later)
  if (userId !== requestingUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  res.json({
    success: true,
    user,
  });
});

/**
 * Update user profile
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUserId = req.user.sub;

  if (userId !== requestingUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  const allowedUpdates = {}; // Define what can be updated
  const { username } = req.body;

  if (username) {
    allowedUpdates.username = username;
  }

  const updatedUser = await User.update(userId, allowedUpdates);

  logger.info('User profile updated', { userId });

  res.json({
    success: true,
    user: updatedUser,
  });
});

/**
 * Get account balance
 */
const getBalance = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUserId = req.user.sub;

  if (userId !== requestingUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  res.json({
    success: true,
    balance: {
      accountBalance: user.account_balance,
      totalBalance: user.total_balance,
    },
  });
});

/**
 * Deposit chips (placeholder - integrate payment later)
 */
const deposit = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { amount } = req.body;
  const requestingUserId = req.user.sub;

  if (userId !== requestingUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid amount',
    });
  }

  // TODO: Integrate payment processing (Stripe, PayPal)
  const updatedUser = await User.updateBalance(userId, amount);

  logger.info('User deposit', { userId, amount });

  res.json({
    success: true,
    message: 'Deposit successful',
    balance: updatedUser.account_balance,
  });
});

/**
 * Withdraw chips (placeholder - integrate payment later)
 */
const withdraw = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { amount } = req.body;
  const requestingUserId = req.user.sub;

  if (userId !== requestingUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid amount',
    });
  }

  const user = await User.findById(userId);
  if (user.account_balance < amount) {
    return res.status(400).json({
      success: false,
      error: 'Insufficient balance',
    });
  }

  // TODO: Integrate payment processing
  const updatedUser = await User.updateBalance(userId, -amount);

  logger.info('User withdrawal', { userId, amount });

  res.json({
    success: true,
    message: 'Withdrawal successful',
    balance: updatedUser.account_balance,
  });
});

module.exports = {
  getUserProfile,
  updateUserProfile,
  getBalance,
  deposit,
  withdraw,
};
