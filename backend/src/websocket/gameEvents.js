const logger = require('../utils/logger');
const db = require('../config/database');

const ack = (callback, payload) => {
  if (typeof callback === 'function') {
    callback(payload);
  }
};

const isSeatedAtTable = async (tableId, userId) => {
  const seat = await db.getOne(
    'SELECT position FROM table_seats WHERE table_id = $1 AND player_id = $2 AND is_seated = true',
    [tableId, userId],
  );
  return !!seat;
};

/**
 * Register game event handlers
 */
const registerGameEvents = (io) => {
  io.on('connection', (socket) => {
    /**
     * Join table
     */
    socket.on('JOIN_TABLE', async (data, callback) => {
      const { tableId } = data || {};
      if (!tableId) {
        return ack(callback, { success: false, error: 'tableId is required' });
      }
      const room = `table:${tableId}`;

      try {
        const seated = await isSeatedAtTable(tableId, socket.userId);
        if (!seated) {
          logger.warn('JOIN_TABLE rejected — user not seated', {
            userId: socket.userId,
            tableId,
          });
          return ack(callback, { success: false, error: 'Not seated at this table' });
        }
      } catch (error) {
        logger.error('JOIN_TABLE seat check failed', { tableId, error: error.message });
        return ack(callback, { success: false, error: 'Failed to verify seat' });
      }

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

      ack(callback, { success: true });
    });

    /**
     * Leave table
     */
    socket.on('LEAVE_TABLE', (data, callback) => {
      const { tableId } = data || {};
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

      ack(callback, { success: true });
    });

    /**
     * Player action (fold, check, call, raise, all-in)
     */
    socket.on('PLAYER_ACTION', (data, callback) => {
      const { tableId, action, amount } = data || {};
      const room = `table:${tableId}`;

      if (!socket.rooms.has(room)) {
        return ack(callback, { success: false, error: 'Not joined to this table' });
      }

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

      ack(callback, { success: true });
    });

    /**
     * Player ready for next hand
     */
    socket.on('PLAYER_READY', (data, callback) => {
      const { tableId } = data || {};
      const room = `table:${tableId}`;

      if (!socket.rooms.has(room)) {
        return ack(callback, { success: false, error: 'Not joined to this table' });
      }

      logger.debug('Player ready', {
        userId: socket.userId,
        tableId,
      });

      io.to(room).emit('PLAYER_READY_NOTIFICATION', {
        playerId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString(),
      });

      ack(callback, { success: true });
    });

    /**
     * Chat message
     */
    socket.on('CHAT_MESSAGE', (data, callback) => {
      const { tableId, message } = data || {};
      const room = `table:${tableId}`;

      if (!socket.rooms.has(room)) {
        return ack(callback, { success: false, error: 'Not joined to this table' });
      }

      if (!message || message.trim().length === 0) {
        return ack(callback, { success: false, error: 'Empty message' });
      }

      if (message.length > 500) {
        return ack(callback, { success: false, error: 'Message too long' });
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

      ack(callback, { success: true });
    });
  });
};

module.exports = {
  registerGameEvents,
};
