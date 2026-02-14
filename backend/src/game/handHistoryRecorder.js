const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Hand history recording system
 */
class HandHistoryRecorder {
  /**
   * Create a new game record
   */
  static async createGame(tableId, handNumber, smallBlind, bigBlind, players) {
    try {
      const result = await db.getOne(
        `INSERT INTO games (table_id, hand_number, game_start_time, status)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         RETURNING id, table_id, hand_number, game_start_time`,
        [tableId, handNumber, 'IN_PROGRESS'],
      );

      logger.info('Game created', {
        gameId: result.id,
        tableId,
        handNumber,
        playerCount: players.length,
      });

      return result.id;
    } catch (error) {
      logger.error('Error creating game', { error: error.message });
      throw error;
    }
  }

  /**
   * Record player hole cards
   */
  static async recordPlayerCards(gameId, playerId, card1, card2) {
    try {
      await db.query(
        `INSERT INTO player_cards (game_id, player_id, card_1, card_2)
         VALUES ($1, $2, $3, $4)`,
        [gameId, playerId, card1, card2],
      );

      logger.debug('Player cards recorded', { gameId, playerId });
    } catch (error) {
      logger.error('Error recording player cards', { error: error.message });
      throw error;
    }
  }

  /**
   * Record community cards
   */
  static async recordCommunityCards(gameId, cards, startIndex = 0) {
    try {
      for (let i = 0; i < cards.length; i++) {
        await db.query(
          `INSERT INTO community_cards (game_id, card_position, card)
           VALUES ($1, $2, $3)`,
          [gameId, i + startIndex, cards[i]],
        );
      }

      logger.debug('Community cards recorded', { gameId, cardCount: cards.length });
    } catch (error) {
      logger.error('Error recording community cards', { error: error.message });
      throw error;
    }
  }

  /**
   * Record player action
   */
  static async recordAction(gameId, actionOrder, playerId, action, amount, street) {
    try {
      await db.query(
        `INSERT INTO hand_history (game_id, action_order, player_id, action, amount, street)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [gameId, actionOrder, playerId, action, amount || null, street],
      );

      logger.debug('Action recorded', {
        gameId,
        playerId,
        action,
        amount,
        street,
      });
    } catch (error) {
      logger.error('Error recording action', { error: error.message });
      throw error;
    }
  }

  /**
   * Record game result
   */
  static async recordGameResult(gameId, results) {
    try {
      const transaction = async (client) => {
        // Update game status
        await client.query(
          `UPDATE games SET status = $1, game_end_time = CURRENT_TIMESTAMP
           WHERE id = $2`,
          ['COMPLETED', gameId],
        );

        // Record individual results
        for (const result of results) {
          await client.query(
            `INSERT INTO game_results (
              game_id, player_id, player_position, hole_cards,
              best_hand, final_stack, win_amount, finish_position
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              gameId,
              result.playerId,
              result.position,
              result.holeCards || null,
              result.bestHand,
              result.finalStack,
              result.winAmount || 0,
              result.finishPosition,
            ],
          );
        }
      };

      await db.transaction(transaction);

      logger.info('Game result recorded', {
        gameId,
        resultCount: results.length,
      });
    } catch (error) {
      logger.error('Error recording game result', { error: error.message });
      throw error;
    }
  }

  /**
   * Record RNG audit info
   */
  static async recordRNGAudit(gameId, seedHash, deckHash) {
    try {
      await db.query(
        `INSERT INTO rng_audit (game_id, seed_hash, deck_hash)
         VALUES ($1, $2, $3)`,
        [gameId, seedHash, deckHash],
      );

      logger.debug('RNG audit recorded', { gameId });
    } catch (error) {
      logger.error('Error recording RNG audit', { error: error.message });
      throw error;
    }
  }

  /**
   * Get game hand history
   */
  static async getGameHistory(gameId) {
    try {
      const history = await db.getAll(
        `SELECT id, action_order, player_id, action, amount, street, timestamp
         FROM hand_history
         WHERE game_id = $1
         ORDER BY action_order ASC`,
        [gameId],
      );

      return history;
    } catch (error) {
      logger.error('Error fetching game history', { gameId, error: error.message });
      throw error;
    }
  }

  /**
   * Get user's recent games
   */
  static async getUserGames(userId, limit = 50, offset = 0) {
    try {
      const games = await db.getAll(
        `SELECT DISTINCT g.id, g.table_id, g.hand_number, g.game_start_time,
                g.game_end_time, g.final_pot, gr.best_hand, gr.win_amount
         FROM games g
         LEFT JOIN game_results gr ON g.id = gr.game_id
         WHERE gr.player_id = $1 OR EXISTS (
           SELECT 1 FROM player_cards pc WHERE pc.game_id = g.id AND pc.player_id = $1
         )
         ORDER BY g.game_start_time DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      return games;
    } catch (error) {
      logger.error('Error fetching user games', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get game statistics for player
   */
  static async getPlayerStats(userId) {
    try {
      const stats = await db.getOne(
        `SELECT
          COUNT(DISTINCT g.id) as games_played,
          COUNT(CASE WHEN gr.win_amount > 0 THEN 1 END) as wins,
          SUM(gr.win_amount) as total_winnings,
          AVG(g.final_pot) as avg_pot,
          MAX(gr.win_amount) as largest_win
         FROM games g
         LEFT JOIN game_results gr ON g.id = gr.game_id
         WHERE gr.player_id = $1`,
        [userId],
      );

      return {
        gamesPlayed: parseInt(stats.games_played || 0, 10),
        wins: parseInt(stats.wins || 0, 10),
        totalWinnings: parseFloat(stats.total_winnings || 0),
        avgPot: parseFloat(stats.avg_pot || 0),
        largestWin: parseFloat(stats.largest_win || 0),
        winRate: stats.games_played > 0
          ? ((parseInt(stats.wins || 0, 10) / parseInt(stats.games_played, 10)) * 100).toFixed(2)
          : 0,
      };
    } catch (error) {
      logger.error('Error fetching player stats', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Cancel a game (if interrupted)
   */
  static async cancelGame(gameId, reason) {
    try {
      await db.query(
        `UPDATE games SET status = $1, game_end_time = CURRENT_TIMESTAMP
         WHERE id = $2`,
        ['CANCELLED', gameId],
      );

      logger.info('Game cancelled', { gameId, reason });
    } catch (error) {
      logger.error('Error cancelling game', { gameId, error: error.message });
      throw error;
    }
  }
}

module.exports = HandHistoryRecorder;
