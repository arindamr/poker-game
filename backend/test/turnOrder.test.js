const { GameStateMachine, GAME_STATE } = require('../src/game/gameState');

describe('Turn order and blinds', () => {
  test('posts blinds and sets preflop actor', () => {
    const players = [
      { id: 'p1', stack: 100, seat: 0 },
      { id: 'p2', stack: 100, seat: 1 },
      { id: 'p3', stack: 100, seat: 2 },
    ];

    const gsm = new GameStateMachine('g1', 't1', players, 1, 2);
    gsm.startHand();
    gsm.postBlinds();
    gsm.state = GAME_STATE.PRE_FLOP;
    gsm.startBettingRound(gsm.getStartIndexPreflop());

    expect(gsm.currentBet).toBe(2);
    expect(gsm.currentActorId).toBe('p2'); // left of big blind (seat 0)
  });

  test('postflop starts left of button', () => {
    const players = [
      { id: 'p1', stack: 100, seat: 0 },
      { id: 'p2', stack: 100, seat: 1 },
      { id: 'p3', stack: 100, seat: 2 },
    ];

    const gsm = new GameStateMachine('g1', 't1', players, 1, 2);
    gsm.startHand();
    gsm.postBlinds();
    gsm.state = GAME_STATE.FLOP;
    gsm.startBettingRound(gsm.getStartIndexPostflop());

    expect(gsm.currentActorId).toBe('p3'); // left of button (seat 1)
  });
});
