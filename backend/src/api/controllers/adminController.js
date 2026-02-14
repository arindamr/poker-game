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

module.exports = {
  getAllTables,
  deleteTable,
};
