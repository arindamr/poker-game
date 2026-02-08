const configRedis = require('../config/redis');

/**
 * Thin wrapper around the configured redis client to provide
 * the small set of methods tests expect (get, set, flushdb, etc).
 */
const client = configRedis.client;

const flushdb = async () => {
  if (client && typeof client.flushdb === 'function') {
    return client.flushdb();
  }
  // If wrapper-only implementation, try DEL on known keys (noop)
  return Promise.resolve();
};

module.exports = {
  get: configRedis.get,
  set: configRedis.set,
  del: configRedis.del,
  exists: configRedis.exists,
  incr: configRedis.incr,
  expire: configRedis.expire,
  close: configRedis.close,
  flushdb,
  client,
};
