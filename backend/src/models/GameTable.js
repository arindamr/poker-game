const db = require('../config/database');
const logger = require('../utils/logger');

const GameTable = {
  /**
   * Create a new table
   */
  create: async (name, smallBlind, bigBlind, minBuyIn, maxBuyIn, maxSeats, createdBy) => {
    try {
      const result = await db.getOne(
        `INSERT INTO game_tables (name, small_blind, big_blind, min_buy_in, max_buy_in, max_seats, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, small_blind, big_blind, status, created_at`,
        [name, smallBlind, bigBlind, minBuyIn, maxBuyIn, maxSeats, createdBy],
      );
      return result;
    } catch (error) {
      logger.error('Error creating table', { error: error.message });
      throw error;
    }
  },

  /**
   * Find table by ID
   */
  findById: async (tableId) => {
    try {
      return await db.getOne(
        `SELECT id, name, small_blind, big_blind, min_buy_in, max_buy_in, 
                max_seats, current_players, game_type, status, created_at, created_by
         FROM game_tables WHERE id = $1`,
        [tableId],
      );
    } catch (error) {
      logger.error('Error finding table', { tableId, error: error.message });
      throw error;
    }
  },

  /**
   * Get all active tables
   */
  getActive: async (limit = 50, offset = 0) => {
    try {
      return await db.getAll(
        `SELECT id, name, small_blind, big_blind, min_buy_in, max_buy_in, 
                max_seats, current_players, status, created_at, created_by
         FROM game_tables WHERE status = 'WAITING' OR status = 'RUNNING'
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
    } catch (error) {
      logger.error('Error getting active tables', { error: error.message });
      throw error;
    }
  },

  /**
   * Update table player count
   */
  updatePlayerCount: async (tableId, count) => {
    try {
      await db.query(
        `UPDATE game_tables SET current_players = $1 WHERE id = $2`,
        [count, tableId],
      );
    } catch (error) {
      logger.error('Error updating player count', { tableId, error: error.message });
      throw error;
    }
  },

  /**
   * Update table status
   */
  updateStatus: async (tableId, status) => {
    try {
      await db.query(
        `UPDATE game_tables SET status = $1 WHERE id = $2`,
        [status, tableId],
      );
    } catch (error) {
      logger.error('Error updating table status', { tableId, error: error.message });
      throw error;
    }
  },

  /**
   * Delete table
   */
  delete: async (tableId) => {
    try {
      await db.transaction(async (client) => {
        const gameIdsRes = await client.query(
          'SELECT id FROM games WHERE table_id = $1',
          [tableId],
        );
        const gameIds = gameIdsRes.rows.map((row) => row.id);

        if (gameIds.length > 0) {
          await client.query(
            'DELETE FROM rng_audit WHERE game_id = ANY($1::uuid[])',
            [gameIds],
          );
          await client.query(
            'DELETE FROM games WHERE table_id = $1',
            [tableId],
          );
        }

        await client.query(
          'DELETE FROM table_seats WHERE table_id = $1',
          [tableId],
        );

        await client.query(
          'DELETE FROM game_tables WHERE id = $1',
          [tableId],
        );
      });
    } catch (error) {
      logger.error('Error deleting table', { tableId, error: error.message });
      throw error;
    }
  },
};

module.exports = GameTable;
