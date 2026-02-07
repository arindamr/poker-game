const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

/**
 * Execute a query
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Query took ${duration}ms`, { query: text, params });
    }
    return result;
  } catch (error) {
    logger.error('Database query error', { query: text, params, error: error.message });
    throw error;
  }
};

/**
 * Get a single row
 */
const getOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0];
};

/**
 * Get all rows
 */
const getAll = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

/**
 * Transaction wrapper
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction error', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Close the pool
 */
const close = async () => {
  await pool.end();
  logger.info('Database pool closed');
};

module.exports = {
  query,
  getOne,
  getAll,
  transaction,
  close,
  pool,
};
