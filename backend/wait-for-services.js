const net = require('net');
const logger = require('./src/utils/logger') || console;

const hosts = [
  { host: process.env.REDIS_HOST || 'redis', port: parseInt(process.env.REDIS_PORT || '6379', 10) },
  { host: process.env.DB_HOST || 'postgres', port: parseInt(process.env.DB_PORT || '5432', 10) },
];

const timeout = 2000;
const maxAttempts = 60; // try for up to ~2 minutes

function checkHost(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeout);
    socket.once('connect', () => {
      resolved = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
}

(async () => {
  logger.info('Waiting for dependent services to become available...');

  for (const h of hosts) {
    let ok = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      /* eslint-disable no-await-in-loop */
      // eslint-disable-next-line no-await-in-loop
      const healthy = await checkHost(h.host, h.port);
      if (healthy) {
        logger.info(`Service ${h.host}:${h.port} reachable`);
        ok = true;
        break;
      }
      logger.info(`Waiting for ${h.host}:${h.port} (attempt ${attempt}/${maxAttempts})`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!ok) {
      logger.error(`Timed out waiting for ${h.host}:${h.port}`);
      process.exit(1);
    }
  }

  logger.info('All dependent services are available. Starting application.');
  // After checks pass exit normally; compose will run the actual node process next.
  process.exit(0);
})();
