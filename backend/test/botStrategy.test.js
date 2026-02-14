const { decideBotAction } = require('../src/game/botStrategy');
const { ACTION } = require('../src/game/gameState');

describe('Bot strategy', () => {
  test('checks or raises when no bet is active', () => {
    const gameState = { currentBet: 0 };
    const player = { id: 'p1', stack: 100 };
    const action = decideBotAction(gameState, player, 2);
    expect([ACTION.CHECK, ACTION.RAISE]).toContain(action.action);
  });

  test('returns call amount up to current bet', () => {
    const gameState = { currentBet: 20 };
    const player = { id: 'p1', stack: 10 };
    const action = decideBotAction(gameState, player, 2);
    if (action.action === ACTION.CALL) {
      expect(action.amount).toBe(10);
    }
  });

  test('folds or calls when short stacked', () => {
    const gameState = { currentBet: 50 };
    const player = { id: 'p1', stack: 5 };
    const action = decideBotAction(gameState, player, 2);
    expect([ACTION.CALL, ACTION.FOLD, ACTION.ALL_IN]).toContain(action.action);
  });

  test('all-in when stack is at or below current bet', () => {
    const gameState = { currentBet: 25 };
    const player = { id: 'p1', stack: 25 };
    const action = decideBotAction(gameState, player, 2);
    expect(action.action).toBe(ACTION.ALL_IN);
    expect(action.amount).toBe(25);
  });
});
