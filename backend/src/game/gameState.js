const logger = require('../utils/logger');
const SecureShuffler = require('./shuffler');
const HandEvaluator = require('./handEvaluator');

/**
 * Game states
 */
const GAME_STATE = {
  PRE_GAME: 'PRE_GAME',
  PRE_FLOP: 'PRE_FLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
  HAND_COMPLETE: 'HAND_COMPLETE',
};

/**
 * Player action types
 */
const ACTION = {
  FOLD: 'FOLD',
  CHECK: 'CHECK',
  CALL: 'CALL',
  RAISE: 'RAISE',
  ALL_IN: 'ALL_IN',
};

/**
 * Game state machine for Texas Hold'em
 */
class GameStateMachine {
  constructor(gameId, tableId, players, smallBlind, bigBlind) {
    this.gameId = gameId;
    this.tableId = tableId;
    this.players = players; // Array of { id, stack, seat }
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;

    this.state = GAME_STATE.PRE_GAME;
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.actions = [];
    this.handNumber = 0;
    this.buttonPosition = 0;
    this.activePlayers = [...players];
    this.folded = new Set();

    // Shuffle deck
    this.initializeDeck();
  }

  /**
   * Initialize and shuffle deck
   */
  initializeDeck() {
    this.deck = SecureShuffler.generateDeck();
    this.deck = SecureShuffler.shuffleDeck(this.deck);
  }

  /**
   * Deal hole cards to players
   */
  dealHoleCards() {
    const holeCards = {};
    let cardIndex = 0;

    for (const player of this.activePlayers) {
      if (!this.folded.has(player.id)) {
        holeCards[player.id] = [
          this.deck[cardIndex++],
          this.deck[cardIndex++],
        ];
      }
    }

    return holeCards;
  }

  /**
   * Post small blind
   */
  postSmallBlind(playerId) {
    this.currentBet = this.smallBlind;
    this.pot += this.smallBlind;
    logger.debug('Small blind posted', { playerId, amount: this.smallBlind });
  }

  /**
   * Post big blind
   */
  postBigBlind(playerId) {
    this.currentBet = this.bigBlind;
    this.pot += this.bigBlind;
    logger.debug('Big blind posted', { playerId, amount: this.bigBlind });
  }

  /**
   * Process player action
   */
  processAction(playerId, action, amount = 0) {
    if (this.folded.has(playerId)) {
      throw new Error('Player has already folded');
    }

    const player = this.activePlayers.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    switch (action) {
      case ACTION.FOLD:
        this.folded.add(playerId);
        logger.debug('Player folded', { playerId });
        break;

      case ACTION.CHECK:
        if (this.currentBet > 0) {
          throw new Error('Cannot check when bet is active');
        }
        logger.debug('Player checked', { playerId });
        break;

      case ACTION.CALL:
        if (this.currentBet === 0) {
          throw new Error('Cannot call when no bet is active');
        }
        const callAmount = Math.min(this.currentBet, player.stack);
        player.stack -= callAmount;
        this.pot += callAmount;
        logger.debug('Player called', { playerId, amount: callAmount });
        break;

      case ACTION.RAISE:
        if (amount <= this.currentBet) {
          throw new Error('Raise must be greater than current bet');
        }
        if (amount > player.stack) {
          throw new Error('Insufficient chips for raise');
        }
        player.stack -= amount;
        this.pot += amount;
        this.currentBet = amount;
        logger.debug('Player raised', { playerId, amount });
        break;

      case ACTION.ALL_IN:
        if (player.stack === 0) {
          throw new Error('Player has no chips to go all-in');
        }
        this.pot += player.stack;
        this.currentBet = Math.max(this.currentBet, player.stack);
        player.stack = 0;
        logger.debug('Player went all-in', { playerId });
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.actions.push({
      playerId,
      action,
      amount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Move to next street
   */
  nextStreet() {
    switch (this.state) {
      case GAME_STATE.PRE_GAME:
        this.state = GAME_STATE.PRE_FLOP;
        this.currentBet = 0;
        break;

      case GAME_STATE.PRE_FLOP:
        this.state = GAME_STATE.FLOP;
        this.dealFlop();
        this.currentBet = 0;
        break;

      case GAME_STATE.FLOP:
        this.state = GAME_STATE.TURN;
        this.dealTurn();
        this.currentBet = 0;
        break;

      case GAME_STATE.TURN:
        this.state = GAME_STATE.RIVER;
        this.dealRiver();
        this.currentBet = 0;
        break;

      case GAME_STATE.RIVER:
        this.state = GAME_STATE.SHOWDOWN;
        break;

      case GAME_STATE.SHOWDOWN:
        this.state = GAME_STATE.HAND_COMPLETE;
        break;

      default:
        throw new Error(`Cannot advance from state: ${this.state}`);
    }

    logger.debug('Game advanced to street', { state: this.state });
  }

  /**
   * Deal flop (3 community cards)
   */
  dealFlop() {
    const startIndex = this.activePlayers.length * 2 + 1; // After hole cards and burn card
    this.communityCards = [
      this.deck[startIndex],
      this.deck[startIndex + 1],
      this.deck[startIndex + 2],
    ];
    logger.debug('Flop dealt', { cards: this.communityCards });
  }

  /**
   * Deal turn (4th community card)
   */
  dealTurn() {
    const startIndex = this.activePlayers.length * 2 + 4; // After flop
    this.communityCards.push(this.deck[startIndex]);
    logger.debug('Turn dealt', { card: this.deck[startIndex] });
  }

  /**
   * Deal river (5th community card)
   */
  dealRiver() {
    const startIndex = this.activePlayers.length * 2 + 6; // After turn
    this.communityCards.push(this.deck[startIndex]);
    logger.debug('River dealt', { card: this.deck[startIndex] });
  }

  /**
   * Get active players (not folded)
   */
  getActivePlayers() {
    return this.activePlayers.filter(p => !this.folded.has(p.id));
  }

  /**
   * Check if hand is over (all but one folded or all streets completed)
   */
  isHandOver() {
    const active = this.getActivePlayers();
    return active.length <= 1 || this.state === GAME_STATE.HAND_COMPLETE;
  }

  /**
   * Get current pot
   */
  getPot() {
    return this.pot;
  }

  /**
   * Get game state
   */
  getState() {
    return {
      gameId: this.gameId,
      state: this.state,
      pot: this.pot,
      communityCards: this.communityCards,
      activePlayers: this.getActivePlayers().length,
      currentBet: this.currentBet,
    };
  }

  /**
   * Reset for next hand
   */
  resetForNextHand() {
    this.state = GAME_STATE.PRE_GAME;
    this.handNumber++;
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.actions = [];
    this.folded.clear();
    this.buttonPosition = (this.buttonPosition + 1) % this.activePlayers.length;

    this.initializeDeck();
    logger.debug('Game reset for next hand', { handNumber: this.handNumber });
  }
}

module.exports = {
  GameStateMachine,
  GAME_STATE,
  ACTION,
};
