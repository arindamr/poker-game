const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

jest.setTimeout(180000);

const COMPOSE = '../../deployment/aws/docker-compose.yml';
const composeCmd = (cmd) => `docker-compose -f ${COMPOSE} ${cmd}`;

async function waitForLog(container, regex, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout } = await execp(`docker logs --tail 200 ${container}`);
      if (regex.test(stdout)) return true;
    } catch (e) {
      // container may not exist yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for log ${regex} on ${container}`);
}

describe('Service startup ordering', () => {
  test('backend waits for redis and postgres before connecting', async () => {
    // Ensure clean state
    try {
      await execp(composeCmd('down --remove-orphans'));
    } catch (e) {
      // ignore
    }

    // Start DB and Redis first
    await execp(composeCmd('up -d --build postgres redis'));

    // Start backend only
    await execp(composeCmd('up -d --build backend'));

    // Check logs sequence
    await waitForLog('poker_backend', /Waiting for dependent services/ , 30000);
    await waitForLog('poker_backend', /Service redis:6379 reachable/, 60000);
    await waitForLog('poker_backend', /Connected to Redis/, 60000);

    // Cleanup
    await execp(composeCmd('down'));
  });
});
