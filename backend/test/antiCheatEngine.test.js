const db = require('../src/config/database');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const antiCheatEngine = require('../src/game/antiCheatEngine');

describe('AntiCheatEngine contracts', () => {
  afterEach(() => {
    db.query.mockReset();
  });

  test('detectMultiAccount returns score object', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { device_fingerprint: 'device-1', ip_address: '1.1.1.1', created_at: new Date() },
          { device_fingerprint: 'device-1', ip_address: '1.1.1.1', created_at: new Date() },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'other-user' }, { user_id: 'other-user-2' }],
      });

    const result = await antiCheatEngine.detectMultiAccount('user-1');

    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0);
    expect(result.suspicious).toBe(true);
  });

  test('detectRTA returns score object', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ avg_decision_time: 5, total_actions: 25 }],
    });

    const result = await antiCheatEngine.detectRTA('game-1', 'user-1', 100);

    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0);
    expect(result.suspicious).toBe(true);
  });
});
