const PokerEngine = require('./engine');
const db = require('../config/database');
const config = require('../config/env');

const engines = new Map();

const getPlayersForTable = async (tableId) => {
  const result = await db.query(
    `SELECT ts.player_id, ts.stack, ts.position
     FROM table_seats ts
     WHERE ts.table_id = $1 AND ts.is_seated = true
     ORDER BY ts.position`,
    [tableId],
  );
  return result.rows.map((row) => ({
    id: row.player_id,
    stack: Number(row.stack || 0),
    seat: row.position,
  }));
};

const getEngine = async (tableId) => {
  if (engines.has(tableId)) {
    return engines.get(tableId);
  }

  const table = await db.getOne(
    'SELECT id, small_blind, big_blind FROM game_tables WHERE id = $1',
    [tableId],
  );
  if (!table) {
    throw new Error('Table not found');
  }

  const players = await getPlayersForTable(tableId);
  if (players.length === 0) {
    throw new Error('No seated players');
  }

  const engine = new PokerEngine(
    table.id,
    table.id,
    players,
    Number(table.small_blind ?? config.game.smallBlind),
    Number(table.big_blind ?? config.game.bigBlind),
  );
  await engine.startHand();
  engines.set(tableId, engine);
  return engine;
};

const resetEngine = (tableId) => {
  engines.delete(tableId);
};

module.exports = {
  getEngine,
  resetEngine,
};
