jest.mock('../src/game/handHistoryRecorder', () => ({
  createGame: jest.fn().mockResolvedValue('game-1'),
  recordRNGAudit: jest.fn().mockResolvedValue(),
  recordPlayerCards: jest.fn().mockResolvedValue(),
  recordCommunityCards: jest.fn().mockResolvedValue(),
  recordAction: jest.fn().mockResolvedValue(),
  recordGameResult: jest.fn().mockResolvedValue(),
}));

const PokerEngine = require('../src/game/engine');
const { ACTION } = require('../src/game/gameState');

describe('PokerEngine core actions', () => {
  test('CALL with amount 0 still contributes current bet', async () => {
    const players = [
      { id: 'p1', stack: 100, seat: 0 },
      { id: 'p2', stack: 100, seat: 1 },
    ];
    const engine = new PokerEngine('g1', 't1', players, 1, 2);
    engine.gameId = 'g1';
    engine.stateMachine.currentBet = 10;

    await engine.processPlayerAction('p1', ACTION.CALL, 0);
    expect(engine.potCalculator.getPot()).toBe(10);
  });

  test('ALL_IN with amount 0 contributes full stack', async () => {
    const players = [
      { id: 'p1', stack: 25, seat: 0 },
      { id: 'p2', stack: 100, seat: 1 },
    ];
    const engine = new PokerEngine('g1', 't1', players, 1, 2);
    engine.gameId = 'g1';

    await engine.processPlayerAction('p1', ACTION.ALL_IN, 0);
    expect(engine.potCalculator.getPot()).toBe(25);
  });
});
