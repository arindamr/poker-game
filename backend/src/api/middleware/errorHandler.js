const logger = require('../../utils/logger');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: err.details[0].message,
      code: 'VALIDATION_ERROR',
    });
  }

  // Database errors
  if (err.code === '23505') {
    // Unique constraint
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      code: 'DUPLICATE_ENTRY',
    });
  }

  if (err.code === '23503') {
    // Foreign key constraint
    return res.status(400).json({
      success: false,
      error: 'Invalid reference',
      code: 'INVALID_REFERENCE',
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
  });
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler,
};
