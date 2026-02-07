const logger = require('../utils/logger');

/**
 * Register game event handlers
 */
const registerGameEvents = (io) => {
  io.on('connection', (socket) => {
    /**
     * Join table
     */
    socket.on('JOIN_TABLE', (data, callback) => {
      const { tableId } = data;
      const room = `table:${tableId}`;

      socket.join(room);
      logger.info('Player joined table', {
        userId: socket.userId,
        tableId,
        socketId: socket.id,
      });

      // Notify other players
      socket.to(room).emit('PLAYER_JOINED', {
        playerId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString(),
      });

      callback({ success: true });
    });

    /**
     * Leave table
     */
    socket.on('LEAVE_TABLE', (data, callback) => {
      const { tableId } = data;
      const room = `table:${tableId}`;

      socket.leave(room);
      logger.info('Player left table', {
        userId: socket.userId,
        tableId,
        socketId: socket.id,
      });

      // Notify other players
      io.to(room).emit('PLAYER_LEFT', {
        playerId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString(),
      });

      callback({ success: true });
    });

    /**
     * Player action (fold, check, call, raise, all-in)
     */
    socket.on('PLAYER_ACTION', (data, callback) => {
      const { tableId, action, amount } = data;
      const room = `table:${tableId}`;

      logger.debug('Player action received', {
        userId: socket.userId,
        tableId,
        action,
        amount,
      });

      // Broadcast action to all players at table
      io.to(room).emit('PLAYER_ACTION_BROADCAST', {
        playerId: socket.userId,
        username: socket.username,
        action,
        amount: amount || 0,
        timestamp: new Date().toISOString(),
      });

      callback({ success: true });
    });

    /**
     * Player ready for next hand
     */
    socket.on('PLAYER_READY', (data, callback) => {
      const { tableId } = data;
      const room = `table:${tableId}`;

      logger.debug('Player ready', {
        userId: socket.userId,
        tableId,
      });

      io.to(room).emit('PLAYER_READY_NOTIFICATION', {
        playerId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString(),
      });

      callback({ success: true });
    });

    /**
     * Chat message
     */
    socket.on('CHAT_MESSAGE', (data, callback) => {
      const { tableId, message } = data;
      const room = `table:${tableId}`;

      if (!message || message.trim().length === 0) {
        return callback({ success: false, error: 'Empty message' });
      }

      if (message.length > 500) {
        return callback({ success: false, error: 'Message too long' });
      }

      logger.debug('Chat message', {
        userId: socket.userId,
        tableId,
        messageLength: message.length,
      });

      io.to(room).emit('CHAT_MESSAGE_BROADCAST', {
        playerId: socket.userId,
        username: socket.username,
        message,
        timestamp: new Date().toISOString(),
      });

      callback({ success: true });
    });
  });
};

module.exports = {
  registerGameEvents,
};
