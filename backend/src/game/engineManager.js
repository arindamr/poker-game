const PokerEngine = require('./engine');
const db = require('../config/database');
const config = require('../config/env');

const engines = new Map();
const tableLocks = new Map();
const lastButtonSeats = new Map();

/**
 * Pick the index whose seat held the button last hand so startHand()'s +1
 * rotation moves it to the next occupied seat — even if players changed.
 */
const getButtonStartIndex = (tableId, players) => {
  const prevSeat = lastButtonSeats.get(tableId);
  if (prevSeat === undefined) {
    return players.length - 1; // rotates to the first seat
  }
  const exact = players.findIndex((p) => p.seat === prevSeat);
  if (exact >= 0) {
    return exact;
  }
  // Previous button player left: give the button to the next higher seat.
  const next = players.findIndex((p) => p.seat > prevSeat);
  return next >= 0
    ? (next - 1 + players.length) % players.length
    : players.length - 1;
};

/**
 * Serialize engine access per table: queued callers run one at a time so
 * concurrent requests can't interleave mid-hand mutations.
 */
const withTableLock = async (tableId, fn) => {
  const previous = tableLocks.get(tableId) || Promise.resolve();
  const current = previous.catch(() => {}).then(fn);
  // Keep the chain alive regardless of fn's outcome, and clean up when idle.
  const chain = current.catch(() => {}).then(() => {
    if (tableLocks.get(tableId) === chain) {
      tableLocks.delete(tableId);
    }
  });
  tableLocks.set(tableId, chain);
  return current;
};

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
  engine.stateMachine.buttonPosition = getButtonStartIndex(tableId, players);
  await engine.startHand();
  lastButtonSeats.set(
    tableId,
    engine.stateMachine.activePlayers[engine.stateMachine.buttonPosition]?.seat,
  );
  engines.set(tableId, engine);
  return engine;
};

const resetEngine = (tableId) => {
  engines.delete(tableId);
};

module.exports = {
  getEngine,
  resetEngine,
  withTableLock,
};
