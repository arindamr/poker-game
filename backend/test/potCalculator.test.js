const PotCalculator = require('../src/game/potCalculator');

describe('PotCalculator side pots', () => {
  test('calculates side pots correctly', () => {
    const pot = new PotCalculator();
    pot.addBet('A', 100);
    pot.addBet('B', 50);
    pot.addBet('C', 200);

    const sidePots = pot.calculateSidePots();
    expect(sidePots).toEqual([
      { size: 150, contributors: ['B', 'A', 'C'], eligibleWinners: ['B', 'A', 'C'], minContribution: 50 },
      { size: 100, contributors: ['A', 'C'], eligibleWinners: ['A', 'C'], minContribution: 100 },
      { size: 100, contributors: ['C'], eligibleWinners: ['C'], minContribution: 200 },
    ]);
  });

  test('distributes side pots by eligible winners', () => {
    const pot = new PotCalculator();
    pot.addBet('A', 100);
    pot.addBet('B', 50);
    pot.addBet('C', 200);

    const sidePots = pot.calculateSidePots(new Set()); // no folded players
    const handEvaluations = {
      A: { value: 5 },
      B: { value: 7 },
      C: { value: 6 },
    };

    const distribution = pot.distributePot(
      [{ playerId: 'B' }],
      0,
      { sidePots, handEvaluations },
    );

    expect(distribution.distribution).toEqual({
      B: 150,
      C: 200,
    });
  });
});
