const { Server } = require('socket.io');
const config = require('../config/env');
const logger = require('../utils/logger');
const { verifyToken } = require('../utils/crypto');
const { isAllowedOrigin } = require('../utils/corsOrigin');

/**
 * Initialize Socket.IO server
 */
const initializeWebSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, config.cors.origin, config.nodeEnv)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn('WebSocket connection attempt without token');
      return next(new Error('Authentication error'));
    }

    const payload = verifyToken(token);

    if (!payload.sub) {
      logger.warn('Invalid WebSocket token');
      return next(new Error('Invalid token'));
    }

    socket.userId = payload.sub;
    socket.username = payload.username;
    logger.info('WebSocket connection authenticated', { userId: payload.sub });
    next();
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId: socket.userId,
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: socket.userId,
      });
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        error: error.message,
      });
    });
  });

  return io;
};

module.exports = {
  initializeWebSocket,
};
