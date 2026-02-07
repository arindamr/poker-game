/**
 * Poker Game Backend - Entry Point
 * Starts the Express server with all middleware and routes configured
 */

require('dotenv').config();
const { server } = require('./server');
const config = require('./config/env');
const logger = require('./utils/logger');

// Get port from config
const PORT = config.port || 3000;

// Start the server
server.listen(PORT, () => {
  logger.info(`🚀 Poker Game Backend running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
