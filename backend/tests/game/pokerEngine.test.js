/**
 * Unit tests for poker engine
 */
const HandEvaluator = require('../src/game/handEvaluator');
const SecureShuffler = require('../src/game/shuffler');
const PotCalculator = require('../src/game/potCalculator');

describe('Hand Evaluator', () => {
  test('should evaluate royal flush', () => {
    const cards = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(10);
    expect(hand.name).toBe('Royal Flush');
  });

  test('should evaluate straight flush', () => {
    const cards = ['9h', '8h', '7h', '6h', '5h'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(9);
    expect(hand.name).toBe('Straight Flush');
  });

  test('should evaluate four of a kind', () => {
    const cards = ['Ah', 'As', 'Ad', 'Ac', 'Kh'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(8);
    expect(hand.name).toBe('Four of a Kind');
  });

  test('should evaluate full house', () => {
    const cards = ['Ah', 'As', 'Ad', 'Kc', 'Kh'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(7);
    expect(hand.name).toBe('Full House');
  });

  test('should evaluate flush', () => {
    const cards = ['Ah', 'Kh', 'Qh', 'Jh', '9h'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(6);
    expect(hand.name).toBe('Flush');
  });

  test('should evaluate straight', () => {
    const cards = ['9h', '8s', '7d', '6c', '5h'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(5);
    expect(hand.name).toBe('Straight');
  });

  test('should evaluate ace-low straight', () => {
    const cards = ['5h', '4s', '3d', '2c', 'Ah'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(5);
    expect(hand.name).toBe('Straight');
  });

  test('should evaluate three of a kind', () => {
    const cards = ['Ah', 'As', 'Ad', 'Kc', 'Qh'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(4);
    expect(hand.name).toBe('Three of a Kind');
  });

  test('should evaluate two pair', () => {
    const cards = ['Ah', 'As', 'Kd', 'Kc', 'Qh'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(3);
    expect(hand.name).toBe('Two Pair');
  });

  test('should evaluate one pair', () => {
    const cards = ['Ah', 'As', 'Kd', 'Qc', 'Jh'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(2);
    expect(hand.name).toBe('One Pair');
  });

  test('should evaluate high card', () => {
    const cards = ['Ah', 'Ks', 'Qd', 'Jc', '9h'];
    const hand = HandEvaluator.evaluateHand(cards);
    expect(hand.rank).toBe(1);
    expect(hand.name).toBe('High Card');
  });

  test('should find best hand from 7 cards', () => {
    const hole = ['As', 'Ks'];
    const community = ['Qs', 'Js', 'Ts', '2h', '3d'];
    const best = HandEvaluator.findBestHand(hole, community);
    expect(best.rank).toBe(10); // Royal flush
  });
});

describe('Secure Shuffler', () => {
  test('should generate 52-card deck', () => {
    const deck = SecureShuffler.generateDeck();
    expect(deck.length).toBe(52);
    expect(new Set(deck).size).toBe(52); // All unique
  });

  test('should shuffle deck', () => {
    const deck1 = SecureShuffler.generateDeck();
    const deck2 = SecureShuffler.shuffleDeck([...deck1]);
    // Very unlikely to be identical after shuffle
    expect(deck1).not.toEqual(deck2);
  });

  test('should generate seed hash', () => {
    const { seed, hash } = SecureShuffler.generateSeedHash();
    expect(seed).toBeDefined();
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA-256 hex string
  });

  test('should generate deck hash', () => {
    const deck = SecureShuffler.generateDeck();
    const hash = SecureShuffler.generateDeckHash(deck);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });
});

describe('Pot Calculator', () => {
  test('should add bets to pot', () => {
    const calc = new PotCalculator();
    calc.addBet('player1', 10);
    calc.addBet('player2', 20);
    expect(calc.getPot()).toBe(30);
  });

  test('should track player contributions', () => {
    const calc = new PotCalculator();
    calc.addBet('player1', 10);
    calc.addBet('player2', 20);
    expect(calc.getPlayerContribution('player1')).toBe(10);
    expect(calc.getPlayerContribution('player2')).toBe(20);
  });

  test('should calculate rake', () => {
    const calc = new PotCalculator();
    const rake = calc.calculateRake(1000, 0.03);
    expect(rake).toBe(30);
  });

  test('should distribute pot to winners', () => {
    const calc = new PotCalculator();
    calc.addBet('player1', 50);
    calc.addBet('player2', 50);
    const winners = [{ playerId: 'player1' }];
    const distribution = calc.distributePot(winners, 0);
    expect(distribution.distribution['player1']).toBe(100);
  });

  test('should split pot among multiple winners', () => {
    const calc = new PotCalculator();
    calc.addBet('player1', 50);
    calc.addBet('player2', 50);
    const winners = [
      { playerId: 'player1' },
      { playerId: 'player2' },
    ];
    const distribution = calc.distributePot(winners, 0);
    expect(distribution.distribution['player1']).toBe(50);
    expect(distribution.distribution['player2']).toBe(50);
  });

  test('should reset for new hand', () => {
    const calc = new PotCalculator();
    calc.addBet('player1', 50);
    calc.reset();
    expect(calc.getPot()).toBe(0);
    expect(calc.getPlayerContribution('player1')).toBeUndefined();
  });
});
