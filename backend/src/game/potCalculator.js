const logger = require('../utils/logger');

/**
 * Pot calculation and chip distribution
 */
class PotCalculator {
  constructor() {
    this.mainPot = 0;
    this.sidePots = [];
    this.playerContributions = {}; // Track each player's contribution
  }

  /**
   * Add a bet to the pot
   */
  addBet(playerId, amount) {
    this.mainPot += amount;

    if (!this.playerContributions[playerId]) {
      this.playerContributions[playerId] = 0;
    }
    this.playerContributions[playerId] += amount;

    logger.debug('Bet added to pot', { playerId, amount, totalPot: this.mainPot });
  }

  /**
   * Calculate pots when player goes all-in with fewer chips
   * Creates side pots for proper distribution
   */
  calculateSidePots(playerStacks) {
    const contributions = Object.entries(this.playerContributions)
      .map(([playerId, amount]) => ({
        playerId,
        amount,
        stack: playerStacks?.[playerId] || 0,
      }))
      .sort((a, b) => a.amount - b.amount);

    const pots = [];
    let previousAmount = 0;

    for (let i = 0; i < contributions.length; i++) {
      const contrib = contributions[i];
      if (contrib.amount > previousAmount) {
        const potSize = contrib.amount - previousAmount;
        const eligible = contributions.slice(i).map((c) => c.playerId);
        const potAmount = potSize * eligible.length;

        pots.push({
          size: potAmount,
          contributors: eligible,
          minContribution: contrib.amount,
        });

        previousAmount = contrib.amount;
      }
    }

    this.sidePots = pots;
    return pots;
  }

  /**
   * Calculate rake (house commission)
   * @param {number} potSize - Total pot size
   * @param {number} rakePercent - Rake percentage (e.g., 0.03 for 3%)
   * @returns {number} Rake amount
   */
  calculateRake(potSize, rakePercent = 0.03) {
    const rake = potSize * rakePercent;
    const maxRake = 5; // Max rake per hand
    return Math.min(rake, maxRake);
  }

  /**
   * Distribute pot to winners
   * @param {Array} winners - Array of winner objects: { playerId, handRank, bestHand }
   * @param {number} rake - Rake amount to deduct
   * @returns {Object} Distribution details
   */
  distributePot(winners, rake = 0, options = null) {
    if (winners.length === 0) {
      throw new Error('No winners specified');
    }

    const distribution = {};
    const totalPot = this.mainPot - rake;

    if (options?.sidePots?.length && options?.handEvaluations) {
      const sidePots = options.sidePots;
      const handEvaluations = options.handEvaluations;

      sidePots.forEach((pot, potIndex) => {
        let potSize = pot.size;
        if (potIndex === 0 && rake > 0) {
          potSize = Math.max(0, pot.size - rake);
        }

        const eligiblePlayers = pot.contributors.filter((playerId) => handEvaluations[playerId]);
        if (eligiblePlayers.length === 0 || potSize === 0) {
          return;
        }

        let bestValue = -Infinity;
        eligiblePlayers.forEach((playerId) => {
          const value = handEvaluations[playerId].value;
          if (value > bestValue) {
            bestValue = value;
          }
        });

        const potWinners = eligiblePlayers.filter(
          (playerId) => handEvaluations[playerId].value === bestValue,
        );

        const winAmount = Math.floor(potSize / potWinners.length);
        const remainder = potSize % potWinners.length;

        potWinners.forEach((playerId, index) => {
          const payout = winAmount + (index < remainder ? 1 : 0);
          distribution[playerId] = (distribution[playerId] || 0) + payout;
        });
      });
    } else {
      const winAmount = Math.floor(totalPot / winners.length);
      const remainder = totalPot % winners.length;

      winners.forEach((winner, index) => {
        distribution[winner.playerId] = winAmount + (index < remainder ? 1 : 0);
      });
    }

    logger.info('Pot distributed', {
      totalPot: this.mainPot,
      rake,
      distributedAmount: totalPot,
      winnerCount: winners.length,
      distribution,
    });

    return {
      totalPot: this.mainPot,
      rake,
      distributedAmount: totalPot,
      distribution,
    };
  }

  /**
   * Get current pot
   */
  getPot() {
    return this.mainPot;
  }

  /**
   * Get player's contribution
   */
  getPlayerContribution(playerId) {
    return this.playerContributions[playerId] || 0;
  }

  /**
   * Get all contributions
   */
  getAllContributions() {
    return this.playerContributions;
  }

  /**
   * Reset for new hand
   */
  reset() {
    this.mainPot = 0;
    this.sidePots = [];
    this.playerContributions = {};
    logger.debug('Pot calculator reset');
  }

  /**
   * Validate sufficient player balance for all-in
   */
  validateAllIn(playerId, playerStack) {
    if (playerStack <= 0) {
      throw new Error('Player has no chips');
    }
    return true;
  }

  /**
   * Calculate minimum raise amount
   */
  calculateMinimumRaise(currentBet, lastRaiseAmount = null) {
    const minRaise = lastRaiseAmount || currentBet || 0;
    return currentBet + minRaise;
  }

  /**
   * Validate bet is legal
   */
  validateBet(playerId, betAmount, playerStack, currentBet) {
    if (betAmount <= 0) {
      throw new Error('Bet amount must be positive');
    }

    if (betAmount > playerStack + currentBet) {
      throw new Error('Insufficient chips');
    }

    if (betAmount < currentBet && betAmount < playerStack) {
      throw new Error('Bet is too small (not all-in)');
    }

    return true;
  }

  /**
   * Get pot breakdown (main + side pots)
   */
  getPotBreakdown() {
    return {
      mainPot: this.mainPot,
      sidePots: this.sidePots,
      totalPot: this.mainPot,
    };
  }
}

module.exports = PotCalculator;
