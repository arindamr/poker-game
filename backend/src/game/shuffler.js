const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Cryptographically secure deck shuffling using Node.js crypto module
 * Algorithm: Fisher-Yates shuffle with crypto.randomBytes
 */
class SecureShuffler {
  /**
   * Generate standard 52-card deck
   */
  static generateDeck() {
    const suits = ['h', 'd', 'c', 's']; // hearts, diamonds, clubs, spades
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const deck = [];

    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push(rank + suit);
      }
    }

    return deck;
  }

  /**
   * Fisher-Yates shuffle with cryptographically secure random bytes
   * @param {Array} deck - The deck to shuffle
   * @returns {Array} Shuffled deck
   */
  static shuffleDeck(deck) {
    const shuffled = [...deck];

    for (let i = shuffled.length - 1; i > 0; i--) {
      // Generate random bytes for secure random index
      const randomBytes = crypto.randomBytes(4);
      const randomValue = randomBytes.readUInt32BE(0);
      const j = randomValue % (i + 1);

      // Swap
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Generate seed hash for audit trail
   * @returns {Object} { seed: Buffer, hash: string }
   */
  static generateSeedHash() {
    const seed = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return { seed: seed.toString('hex'), hash };
  }

  /**
   * Verify deck hash matches expected shuffle
   * @param {Array} deck - The shuffled deck
   * @returns {string} SHA-256 hash of deck
   */
  static generateDeckHash(deck) {
    const deckString = deck.join('');
    return crypto.createHash('sha256').update(deckString).digest('hex');
  }

  /**
   * Create RNG audit record
   * @param {string} gameId - Game ID for audit
   * @param {string} seedHash - Seed hash
   * @param {string} deckHash - Deck hash
   * @returns {Object} Audit record
   */
  static createAuditRecord(gameId, seedHash, deckHash) {
    return {
      gameId,
      seedHash,
      deckHash,
      createdAt: new Date().toISOString(),
    };
  }
}

module.exports = SecureShuffler;
