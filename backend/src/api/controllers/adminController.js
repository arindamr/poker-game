const db = require('../../config/database');
const GameTable = require('../../models/GameTable');
const { asyncHandler } = require('../middleware/errorHandler');

const getAllTables = asyncHandler(async (req, res) => {
  const tables = await db.getAll(
    `SELECT gt.id, gt.name, gt.small_blind, gt.big_blind, gt.min_buy_in, gt.max_buy_in,
            gt.max_seats, gt.current_players, gt.status, gt.created_at, gt.created_by,
            u.username AS creator_username, u.email AS creator_email
     FROM game_tables gt
     LEFT JOIN users u ON u.id = gt.created_by
     ORDER BY gt.created_at DESC`,
  );

  res.json({
    success: true,
    tables,
    count: tables.length,
  });
});

const deleteTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  await GameTable.delete(tableId);
  res.json({
    success: true,
    message: 'Table deleted',
  });
});

/**
 * Phase 5: Anti-Cheat Admin Endpoints
 */

const getCheatDetections = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;

  const [detections, totalRow] = await Promise.all([
    db.getAll(
      `SELECT cd.*, u.username, u.email
       FROM cheat_detection cd
       JOIN users u ON u.id = cd.user_id
       ORDER BY cd.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    db.getOne('SELECT COUNT(*) AS total FROM cheat_detection'),
  ]);

  res.json({
    success: true,
    detections,
    pagination: {
      total: parseInt(totalRow.total, 10),
      limit,
      offset,
    },
  });
});

const getUserCheatHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const history = await db.getAll(
    `SELECT * FROM cheat_detection 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [userId]
  );

  res.json({
    success: true,
    history,
  });
});

const reviewCheatSuspicion = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status, notes } = req.body; // status: 'dismissed', 'confirmed'

  await db.query(
    `UPDATE cheat_detection 
     SET details = jsonb_set(details::jsonb, '{review}', $1::jsonb)
     WHERE user_id = $2 AND (details->>'review') IS NULL`,
    [JSON.stringify({ status, notes, reviewedAt: new Date(), reviewedBy: req.user.id }), userId]
  );

  res.json({
    success: true,
    message: `Cheat suspicion ${status}`,
  });
});

const banUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  await db.query(
    'UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2',
    [reason || 'Administrative ban', userId]
  );

  // Invalidate all sessions for this user
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

  res.json({
    success: true,
    message: 'User banned and sessions invalidated',
  });
});

module.exports = {
  getAllTables,
  deleteTable,
  getCheatDetections,
  getUserCheatHistory,
  reviewCheatSuspicion,
  banUser,
};
