const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/database');
const redis = require('../src/utils/redis');
const { generateJWT } = require('../src/utils/auth');
const User = require('../src/models/User');
const { hashPassword } = require('../src/utils/crypto');

const getOrCreateUser = async ({ username, email, password }) => {
  const passwordHash = await hashPassword(password);
  try {
    return await User.create(username, email, passwordHash, '127.0.0.1');
  } catch (error) {
    const byEmail = await User.findByEmail(email);
    if (byEmail) {
      return byEmail;
    }
    const byUsername = await User.findByUsername(username);
    if (byUsername) {
      return byUsername;
    }
    const uniqueUsername = `${username}${Date.now()}`;
    return await User.create(uniqueUsername, email, passwordHash, '127.0.0.1');
  }
};

describe('Table action flow with bots', () => {
  let authToken;
  let tableId;

  beforeAll(async () => {
    const waitForDb = async (attempts = 30, delayMs = 1000) => {
      for (let i = 0; i < attempts; i++) {
        try {
          await db.query('SELECT 1');
          return;
        } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      throw new Error('Database not ready');
    };

    const waitForRedis = async (attempts = 30, delayMs = 1000) => {
      for (let i = 0; i < attempts; i++) {
        try {
          if (redis.client && typeof redis.client.ping === 'function') {
            await redis.client.ping();
            return;
          }
          await redis.get('healthcheck');
          return;
        } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      throw new Error('Redis not ready');
    };

    await waitForDb();
    await waitForRedis();

    try {
      await db.migrate();
    } catch (error) {
      // ignore
    }

    const user = await getOrCreateUser({
      username: 'actiontest',
      email: 'actiontest@pokergame.com',
      password: 'Password123',
    });

    authToken = generateJWT({ sub: user.id, username: user.username, email: user.email });

    const tableRes = await request(app)
      .post('/api/v1/tables')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Action Test Table',
        smallBlind: 1,
        bigBlind: 2,
        minBuyIn: 100,
        maxBuyIn: 200,
        maxSeats: 6,
      });

    tableId = tableRes.body?.table?.id;
  });

  afterAll(async () => {
    try {
      await redis.close();
    } catch (error) {
      // ignore
    }
    try {
      await db.close();
    } catch (error) {
      // ignore
    }
  });

  test('join table, add bots, and take an action', async () => {
    const joinRes = await request(app)
      .post(`/api/v1/tables/${tableId}/join`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(joinRes.status).toBe(200);

    const botRes = await request(app)
      .post(`/api/v1/tables/${tableId}/bots`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ count: 2 });
    expect(botRes.status).toBe(200);

    const actionRes = await request(app)
      .post(`/api/v1/tables/${tableId}/action`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ action: 'CHECK' });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body?.state).toBeDefined();
    expect(Array.isArray(actionRes.body?.botActions)).toBe(true);
  });
});
