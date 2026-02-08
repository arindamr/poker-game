const dbConfig = require('../config/database');
const migrations = require('../../migrations/migrate');

/**
 * Run migrations (named migrate() for tests)
 */
const migrate = async () => {
  // migrate.js exports runMigrations
  if (migrations && typeof migrations.runMigrations === 'function') {
    return migrations.runMigrations();
  }
  // Fallback: no-op
  return Promise.resolve();
};

module.exports = {
  migrate,
  query: dbConfig.query,
  getOne: dbConfig.getOne,
  getAll: dbConfig.getAll,
  transaction: dbConfig.transaction,
  close: dbConfig.close,
  pool: dbConfig.pool,
};
