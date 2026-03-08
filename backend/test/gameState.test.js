const { GameStateMachine } = require('../src/game/gameState');

describe('GameStateMachine dealing order', () => {
  test('deals flop/turn/river with burn cards', () => {
    const players = [
      { id: 'p1', stack: 1000, seat: 0 },
      { id: 'p2', stack: 1000, seat: 1 },
    ];

    const gsm = new GameStateMachine('g1', 't1', players, 1, 2);
    const deck = Array.from({ length: 52 }, (_, i) => `c${i}`);
    gsm.deck = deck;

    gsm.dealHoleCards(); // sets deckIndex = 4 (2 players × 2 cards)
    gsm.dealFlop();
    gsm.dealTurn();
    gsm.dealRiver();

    expect(gsm.communityCards).toEqual([
      deck[5],
      deck[6],
      deck[7],
      deck[9],
      deck[11],
    ]);
  });
});
