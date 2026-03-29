const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware to validate request and return 400 if validation fails
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

  logger.warn('Validation failed', { 
    path: req.path, 
    errors: extractedErrors,
    userId: req.user?.id 
  });

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: extractedErrors,
  });
};

/**
 * Authentication validation rules
 */
const authValidation = {
  register: [
    body('username')
      .isString()
      .isLength({ min: 3, max: 30 })
      .trim()
      .escape()
      .withMessage('Username must be 3-30 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must include uppercase, lowercase, number, and special character'),
    validate
  ],
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate
  ],
};

/**
 * Game validation rules
 */
const gameValidation = {
  createTable: [
    body('blinds.small').isInt({ min: 1 }).withMessage('Small blind must be at least 1'),
    body('blinds.big').isInt({ min: 2 }).withMessage('Big blind must be at least 2'),
    body('buyIn').isInt({ min: 10 }).withMessage('Minimum buy-in is 10'),
    body('maxPlayers').isInt({ min: 2, max: 10 }).withMessage('Players must be between 2 and 10'),
    validate
  ],
  joinTable: [
    param('gameId').isUUID().withMessage('Invalid game ID'),
    body('buyIn').isInt({ min: 1 }).withMessage('Buy-in amount required'),
    validate
  ],
  action: [
    param('gameId').isUUID().withMessage('Invalid game ID'),
    body('action').isIn(['fold', 'check', 'call', 'bet', 'raise']).withMessage('Invalid action'),
    body('amount').optional().isInt({ min: 0 }).withMessage('Amount must be positive'),
    validate
  ]
};

/**
 * Security validation rules
 */
const securityValidation = {
  verify2FA: [
    body('token').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Invalid 2FA token'),
    validate
  ],
  kycInitiate: [
    body('firstName').isString().trim().isLength({ min: 1 }).escape(),
    body('lastName').isString().trim().isLength({ min: 1 }).escape(),
    body('dateOfBirth').isISO8601().withMessage('Invalid date of birth'),
    validate
  ],
  deposit: [
    body('amount').isFloat({ min: 1, max: 10000 }).withMessage('Deposit must be between 1 and 10,000'),
    body('paymentMethod').isIn(['credit_card', 'bank_transfer', 'crypto']).withMessage('Invalid payment method'),
    validate
  ]
};

module.exports = {
  authValidation,
  gameValidation,
  securityValidation,
  validate
};
