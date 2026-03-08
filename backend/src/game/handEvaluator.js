const logger = require('../utils/logger');

/**
 * Hand rankings (highest to lowest)
 * 10 - Royal Flush
 * 9  - Straight Flush
 * 8  - Four of a Kind
 * 7  - Full House
 * 6  - Flush
 * 5  - Straight
 * 4  - Three of a Kind
 * 3  - Two Pair
 * 2  - One Pair
 * 1  - High Card
 */
class HandEvaluator {
  /**
   * Get numeric rank value
   */
  static getRankValue(card) {
    const ranks = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
    };
    return ranks[card[0]];
  }

  /**
   * Get suit from card
   */
  static getSuit(card) {
    return card[1];
  }

  /**
   * Get rank from card
   */
  static getRank(card) {
    return card[0];
  }

  /**
   * Check if hand is a flush
   */
  static isFlush(cards) {
    const suits = cards.map(c => this.getSuit(c));
    return new Set(suits).size === 1;
  }

  /**
   * Check if hand is a straight
   */
  static isStraight(cards) {
    const ranks = cards
      .map(c => this.getRankValue(c))
      .sort((a, b) => b - a);

    // Check consecutive sequence
    for (let i = 0; i < ranks.length - 1; i++) {
      if (ranks[i] - ranks[i + 1] !== 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check for Ace-low straight (A-2-3-4-5)
   */
  static isAceLowStraight(cards) {
    const ranks = cards.map(c => this.getRankValue(c)).sort((a, b) => a - b);
    return (
      ranks[0] === 2 &&
      ranks[1] === 3 &&
      ranks[2] === 4 &&
      ranks[3] === 5 &&
      ranks[4] === 14
    );
  }

  /**
   * Get rank counts (for pairs, three of a kind, etc)
   */
  static getRankCounts(cards) {
    const counts = {};
    cards.forEach(card => {
      const rank = this.getRank(card);
      counts[rank] = (counts[rank] || 0) + 1;
    });
    return counts;
  }

  /**
   * Evaluate a 5-card poker hand
   * Returns { rank, name, value, kickers }
   */
  static evaluateHand(cards) {
    if (cards.length !== 5) {
      throw new Error('Hand must contain exactly 5 cards');
    }

    const isFlushHand = this.isFlush(cards);
    const isStraightHand = this.isStraight(cards) || this.isAceLowStraight(cards);
    const rankCounts = this.getRankCounts(cards);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    // Each hand tier is 1,000,000 apart so flush encoding (up to ~154k) fits within its tier.
    // Royal Flush (10-J-Q-K-A, same suit)
    if (isFlushHand && isStraightHand) {
      const ranks = cards.map(c => this.getRankValue(c)).sort((a, b) => b - a);
      if (ranks[0] === 14 && ranks[1] === 13 && ranks[2] === 12 && ranks[3] === 11 && ranks[4] === 10) {
        return {
          rank: 10,
          name: 'Royal Flush',
          value: 10000000,
          kickers: [],
        };
      }

      // Straight Flush
      return {
        rank: 9,
        name: 'Straight Flush',
        value: 9000000 + ranks[0],
        kickers: ranks,
      };
    }

    // Four of a Kind
    if (counts[0] === 4) {
      const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
      const kicker = Object.keys(rankCounts).find(r => rankCounts[r] === 1);
      const fourValue = this.getRankValue(fourRank + 'x');
      const kickerValue = this.getRankValue(kicker + 'x');
      return {
        rank: 8,
        name: 'Four of a Kind',
        value: 8000000 + fourValue * 100 + kickerValue,
        kickers: [fourRank, fourRank, fourRank, fourRank, kicker],
      };
    }

    // Full House (three of a kind + pair)
    if (counts[0] === 3 && counts[1] === 2) {
      const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
      const pairRank = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
      const threeValue = this.getRankValue(threeRank + 'x');
      const pairValue = this.getRankValue(pairRank + 'x');
      return {
        rank: 7,
        name: 'Full House',
        value: 7000000 + threeValue * 100 + pairValue,
        kickers: [threeRank, threeRank, threeRank, pairRank, pairRank],
      };
    }

    // Flush — max encoding: 14*10000+13*1000+12*100+11*10+9 = 154,319 (fits within 1M tier gap)
    if (isFlushHand) {
      const ranks = cards.map(c => this.getRankValue(c)).sort((a, b) => b - a);
      return {
        rank: 6,
        name: 'Flush',
        value: 6000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4],
        kickers: ranks,
      };
    }

    // Straight
    if (isStraightHand) {
      const ranks = cards.map(c => this.getRankValue(c)).sort((a, b) => b - a);
      const highCard = this.isAceLowStraight(cards) ? 5 : ranks[0];
      return {
        rank: 5,
        name: 'Straight',
        value: 5000000 + highCard,
        kickers: this.isAceLowStraight(cards) ? [5, 4, 3, 2, 1] : ranks,
      };
    }

    // Three of a Kind
    if (counts[0] === 3) {
      const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
      const kickers = Object.keys(rankCounts)
        .filter(r => rankCounts[r] === 1)
        .map(r => this.getRankValue(r + 'x'))
        .sort((a, b) => b - a);
      const threeValue = this.getRankValue(threeRank + 'x');
      return {
        rank: 4,
        name: 'Three of a Kind',
        value: 4000000 + threeValue * 1000 + kickers[0] * 100 + kickers[1],
        kickers: [threeRank, threeRank, threeRank, ...Object.keys(rankCounts).filter(r => rankCounts[r] === 1)],
      };
    }

    // Two Pair — kicker is always a numeric value for consistent comparison
    if (counts[0] === 2 && counts[1] === 2) {
      const pairs = Object.keys(rankCounts)
        .filter(r => rankCounts[r] === 2)
        .map(r => this.getRankValue(r + 'x'))
        .sort((a, b) => b - a);
      const kickerRank = Object.keys(rankCounts).find(r => rankCounts[r] === 1);
      const kickerValue = this.getRankValue(kickerRank + 'x');
      return {
        rank: 3,
        name: 'Two Pair',
        value: 3000000 + pairs[0] * 1000 + pairs[1] * 100 + kickerValue,
        kickers: [pairs[0], pairs[1], kickerValue],
      };
    }

    // One Pair
    if (counts[0] === 2) {
      const pairRank = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
      const kickers = Object.keys(rankCounts)
        .filter(r => rankCounts[r] === 1)
        .map(r => this.getRankValue(r + 'x'))
        .sort((a, b) => b - a);
      const pairValue = this.getRankValue(pairRank + 'x');
      return {
        rank: 2,
        name: 'One Pair',
        value: 2000000 + pairValue * 1000 + kickers[0] * 100 + kickers[1] * 10 + kickers[2],
        kickers: [pairValue, ...kickers],
      };
    }

    // High Card
    const ranks = cards.map(c => this.getRankValue(c)).sort((a, b) => b - a);
    return {
      rank: 1,
      name: 'High Card',
      value: 1000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4],
      kickers: ranks,
    };
  }

  /**
   * Find best 5-card hand from 7 cards (hole + community)
   */
  static findBestHand(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards];

    // Generate all 5-card combinations
    const combinations = this.generateCombinations(allCards, 5);
    let bestHand = null;
    let bestValue = -1;

    for (const combo of combinations) {
      const hand = this.evaluateHand(combo);
      if (hand.value > bestValue) {
        bestValue = hand.value;
        bestHand = hand;
      }
    }

    return bestHand;
  }

  /**
   * Generate all n-combinations from an array
   */
  static generateCombinations(array, n) {
    if (n === 1) {
      return array.map(item => [item]);
    }

    const combinations = [];
    for (let i = 0; i <= array.length - n; i++) {
      const head = array[i];
      const tailCombinations = this.generateCombinations(array.slice(i + 1), n - 1);
      for (const tail of tailCombinations) {
        combinations.push([head, ...tail]);
      }
    }

    return combinations;
  }

  /**
   * Compare hands and determine winner
   * Returns -1 if hand1 is better, 1 if hand2 is better, 0 if tie
   */
  static compareHands(hand1, hand2) {
    if (hand1.value > hand2.value) {
      return -1;
    } else if (hand1.value < hand2.value) {
      return 1;
    }
    return 0;
  }
}

module.exports = HandEvaluator;
