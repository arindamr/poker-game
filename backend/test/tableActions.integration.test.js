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
  let secondAuthToken;
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

    const secondUser = await getOrCreateUser({
      username: 'actiontest2',
      email: 'actiontest2@pokergame.com',
      password: 'Password123',
    });
    secondAuthToken = generateJWT({
      sub: secondUser.id,
      username: secondUser.username,
      email: secondUser.email,
    });

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

  test('state polling advances game when current actor is a bot', async () => {
    const createRes = await request(app)
      .post('/api/v1/tables')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bot Turn Auto Progress Table',
        smallBlind: 1,
        bigBlind: 2,
        minBuyIn: 100,
        maxBuyIn: 200,
        maxSeats: 6,
      });
    expect(createRes.status).toBe(201);
    const autoTableId = createRes.body?.table?.id;

    const joinRes = await request(app)
      .post(`/api/v1/tables/${autoTableId}/join`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(joinRes.status).toBe(200);

    const botRes = await request(app)
      .post(`/api/v1/tables/${autoTableId}/bots`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ count: 2 });
    expect(botRes.status).toBe(200);

    const stateRes = await request(app)
      .get(`/api/v1/tables/${autoTableId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(stateRes.status).toBe(200);
    expect(Array.isArray(stateRes.body?.botActions)).toBe(true);
    expect(stateRes.body?.botActions?.length).toBeGreaterThan(0);
  });

  test('next hand waits for all human confirmations', async () => {
    const createRes = await request(app)
      .post('/api/v1/tables')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Next Hand Confirmation Table',
        smallBlind: 1,
        bigBlind: 2,
        minBuyIn: 100,
        maxBuyIn: 200,
        maxSeats: 6,
      });
    expect(createRes.status).toBe(201);
    const tableForConfirm = createRes.body?.table?.id;

    const joinOne = await request(app)
      .post(`/api/v1/tables/${tableForConfirm}/join`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(joinOne.status).toBe(200);

    const joinTwo = await request(app)
      .post(`/api/v1/tables/${tableForConfirm}/join`)
      .set('Authorization', `Bearer ${secondAuthToken}`);
    expect(joinTwo.status).toBe(200);

    // Complete a hand quickly by folding one player.
    const actionRes = await request(app)
      .post(`/api/v1/tables/${tableForConfirm}/action`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ action: 'FOLD' });
    expect(actionRes.status).toBe(200);
    expect(actionRes.body?.roundResult).toBeDefined();
    expect(actionRes.body?.nextHand?.required).toBe(2);

    const readyOne = await request(app)
      .post(`/api/v1/tables/${tableForConfirm}/next-hand/ready`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(readyOne.status).toBe(200);
    expect(readyOne.body?.started).toBe(false);
    expect(readyOne.body?.nextHand?.confirmed).toBe(1);

    const stillWaiting = await request(app)
      .get(`/api/v1/tables/${tableForConfirm}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(stillWaiting.status).toBe(200);
    expect(stillWaiting.body?.roundResult).toBeDefined();

    const readyTwo = await request(app)
      .post(`/api/v1/tables/${tableForConfirm}/next-hand/ready`)
      .set('Authorization', `Bearer ${secondAuthToken}`)
      .send({});
    expect(readyTwo.status).toBe(200);
    expect(readyTwo.body?.started).toBe(true);
    expect(readyTwo.body?.roundResult).toBeNull();
  });

  test('state shows only requester hand cards', async () => {
    const firstJoin = await request(app)
      .post(`/api/v1/tables/${tableId}/join`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(firstJoin.status).toBe(200);

    const secondJoin = await request(app)
      .post(`/api/v1/tables/${tableId}/join`)
      .set('Authorization', `Bearer ${secondAuthToken}`);
    expect(secondJoin.status).toBe(200);

    const firstState = await request(app)
      .get(`/api/v1/tables/${tableId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(firstState.status).toBe(200);
    expect(Array.isArray(firstState.body?.state?.playerHand)).toBe(true);
    expect(firstState.body?.state?.playerHand).toHaveLength(2);
    expect(firstState.body?.state?.players?.[0]?.holeCards).toBeUndefined();

    const secondState = await request(app)
      .get(`/api/v1/tables/${tableId}/state`)
      .set('Authorization', `Bearer ${secondAuthToken}`);
    expect(secondState.status).toBe(200);
    expect(Array.isArray(secondState.body?.state?.playerHand)).toBe(true);
    expect(secondState.body?.state?.playerHand).toHaveLength(2);
    expect(secondState.body?.state?.playerHand).not.toEqual(firstState.body?.state?.playerHand);
  });

  test('table status transitions between waiting and running based on seated players', async () => {
    const createRes = await request(app)
      .post('/api/v1/tables')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Status Transition Table',
        smallBlind: 1,
        bigBlind: 2,
        minBuyIn: 100,
        maxBuyIn: 200,
        maxSeats: 6,
      });
    expect(createRes.status).toBe(201);
    const transitionTableId = createRes.body?.table?.id;

    const joinOne = await request(app)
      .post(`/api/v1/tables/${transitionTableId}/join`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(joinOne.status).toBe(200);

    const tableAfterOne = await request(app)
      .get(`/api/v1/tables/${transitionTableId}`);
    expect(tableAfterOne.status).toBe(200);
    expect(tableAfterOne.body?.table?.status).toBe('WAITING');

    const joinTwo = await request(app)
      .post(`/api/v1/tables/${transitionTableId}/join`)
      .set('Authorization', `Bearer ${secondAuthToken}`);
    expect(joinTwo.status).toBe(200);

    const tableAfterTwo = await request(app)
      .get(`/api/v1/tables/${transitionTableId}`);
    expect(tableAfterTwo.status).toBe(200);
    expect(tableAfterTwo.body?.table?.status).toBe('RUNNING');

    const leaveSecond = await request(app)
      .delete(`/api/v1/tables/${transitionTableId}/leave`)
      .set('Authorization', `Bearer ${secondAuthToken}`);
    expect(leaveSecond.status).toBe(200);

    const tableAfterLeave = await request(app)
      .get(`/api/v1/tables/${transitionTableId}`);
    expect(tableAfterLeave.status).toBe(200);
    expect(tableAfterLeave.body?.table?.status).toBe('WAITING');
  });
});
