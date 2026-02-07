const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  family: 4, // Force IPv4
  retryStrategy: (retries) => {
    if (retries > 10) {
      logger.error('Max Redis reconnection attempts reached');
      return new Error('Max retries reached');
    }
    return retries * 50;
  },
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
});

redisClient.on('reconnecting', () => {
  logger.info('Reconnecting to Redis...');
});

/**
 * Connect to Redis
 */
const connect = async () => {
  // ioredis automatically connects, just verify connection
  try {
    await redisClient.ping();
    logger.info('Redis connection verified');
  } catch (error) {
    logger.error('Failed to connect to Redis', { error: error.message });
    throw error;
  }
};

/**
 * Get a value by key
 */
const get = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.error('Redis GET error', { key, error: error.message });
    return null;
  }
};

/**
 * Set a value with optional expiration (in seconds)
 */
const set = async (key, value, expiresIn = null) => {
  try {
    if (expiresIn) {
      await redisClient.setEx(key, expiresIn, value);
    } else {
      await redisClient.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error('Redis SET error', { key, error: error.message });
    return false;
  }
};

/**
 * Delete a key
 */
const del = async (key) => {
  try {
    return await redisClient.del(key);
  } catch (error) {
    logger.error('Redis DEL error', { key, error: error.message });
    return 0;
  }
};

/**
 * Check if key exists
 */
const exists = async (key) => {
  try {
    return await redisClient.exists(key);
  } catch (error) {
    logger.error('Redis EXISTS error', { key, error: error.message });
    return false;
  }
};

/**
 * Increment a value
 */
const incr = async (key) => {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    logger.error('Redis INCR error', { key, error: error.message });
    return null;
  }
};

/**
 * Expire a key
 */
const expire = async (key, seconds) => {
  try {
    return await redisClient.expire(key, seconds);
  } catch (error) {
    logger.error('Redis EXPIRE error', { key, error: error.message });
    return false;
  }
};

/**
 * Close connection
 */
const close = async () => {
  try {
    await redisClient.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection', { error: error.message });
  }
};

module.exports = {
  get,
  set,
  del,
  exists,
  incr,
  expire,
  close,
  client: redisClient,
  connect,
};
