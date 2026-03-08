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
    this.players = [...players].sort((a, b) => a.seat - b.seat); // Array of { id, stack, seat }
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;

    this.state = GAME_STATE.PRE_GAME;
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = bigBlind; // minimum raise increment (starts at BB, updates after each raise)
    this.actions = [];
    this.handNumber = 0;
    this.buttonPosition = 0;
    this.activePlayers = [...this.players];
    this.folded = new Set();
    this.pendingActions = new Set();
    this.currentActorIndex = 0;
    this.currentActorId = null;
    this.lastAggressorId = null;
    this.deckIndex = 0; // tracks how many cards have been dealt from the deck
    this.playerBetsThisRound = {}; // tracks each player's contribution to the current betting round

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
   * Prepare a new hand
   */
  startHand() {
    this.state = GAME_STATE.PRE_GAME;
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.actions = [];
    this.folded.clear();
    this.activePlayers = [...this.players];
    this.pendingActions.clear();
    this.lastAggressorId = null;
    this.currentActorId = null;
    this.currentActorIndex = 0;
    this.deckIndex = 0;
    this.playerBetsThisRound = {};
    this.handNumber += 1;

    if (this.activePlayers.length > 0) {
      this.buttonPosition = (this.buttonPosition + 1) % this.activePlayers.length;
    }
  }

  getPlayerIndex(playerId) {
    return this.activePlayers.findIndex((p) => p.id === playerId);
  }

  getStartIndexPreflop() {
    if (this.activePlayers.length === 0) return 0;
    if (this.activePlayers.length === 2) {
      const bigIndex = (this.buttonPosition + 1) % this.activePlayers.length;
      return (bigIndex + 1) % this.activePlayers.length;
    }
    const bigIndex = (this.buttonPosition + 2) % this.activePlayers.length;
    return (bigIndex + 1) % this.activePlayers.length;
  }

  getStartIndexPostflop() {
    if (this.activePlayers.length === 0) return 0;
    return (this.buttonPosition + 1) % this.activePlayers.length;
  }

  isBettingRoundComplete() {
    return this.pendingActions.size === 0;
  }

  /**
   * Post blinds and return blind info for pot tracking
   */
  postBlinds() {
    if (this.activePlayers.length === 0) {
      return [];
    }

    let smallIndex = (this.buttonPosition + 1) % this.activePlayers.length;
    let bigIndex = (smallIndex + 1) % this.activePlayers.length;

    if (this.activePlayers.length === 2) {
      smallIndex = this.buttonPosition;
      bigIndex = (this.buttonPosition + 1) % this.activePlayers.length;
    }

    const smallPlayer = this.activePlayers[smallIndex];
    const bigPlayer = this.activePlayers[bigIndex];
    const smallAmount = Math.min(this.smallBlind, smallPlayer.stack);
    const bigAmount = Math.min(this.bigBlind, bigPlayer.stack);

    smallPlayer.stack -= smallAmount;
    bigPlayer.stack -= bigAmount;
    // pot is tracked by engine's potCalculator — do not add here
    this.currentBet = bigAmount;
    this.minRaise = this.bigBlind;
    this.lastAggressorId = bigPlayer.id;
    // track blind contributions so CALL and RAISE amounts are correct this round
    this.playerBetsThisRound = {
      [smallPlayer.id]: smallAmount,
      [bigPlayer.id]: bigAmount,
    };

    this.actions.push({
      playerId: smallPlayer.id,
      action: 'SMALL_BLIND',
      amount: smallAmount,
      timestamp: new Date().toISOString(),
    });
    this.actions.push({
      playerId: bigPlayer.id,
      action: 'BIG_BLIND',
      amount: bigAmount,
      timestamp: new Date().toISOString(),
    });

    return [
      { playerId: smallPlayer.id, amount: smallAmount },
      { playerId: bigPlayer.id, amount: bigAmount },
    ];
  }

  /**
   * Initialize betting round and current actor
   */
  startBettingRound(startIndex) {
    // Reset per-round bet tracking for every street except pre-flop
    // (pre-flop bets are already set by postBlinds before this is called)
    if (this.state !== GAME_STATE.PRE_FLOP) {
      this.playerBetsThisRound = {};
    }
    this.pendingActions = new Set(this.getActivePlayers().map((p) => p.id));
    this.currentActorIndex = startIndex % this.activePlayers.length;
    this.currentActorId = null;
    this.advanceToNextActor();
  }

  /**
   * Advance to next actor who is pending and active
   */
  advanceToNextActor() {
    if (this.pendingActions.size === 0) {
      this.currentActorId = null;
      return;
    }

    let attempts = 0;
    while (attempts < this.activePlayers.length) {
      const player = this.activePlayers[this.currentActorIndex];
      if (player && !this.folded.has(player.id) && this.pendingActions.has(player.id)) {
        this.currentActorId = player.id;
        return;
      }
      this.currentActorIndex = (this.currentActorIndex + 1) % this.activePlayers.length;
      attempts += 1;
    }
    this.currentActorId = null;
  }

  /**
   * Mark action complete and adjust pending actions
   */
  /**
   * @param {boolean|null} reopensAction - true forces re-open, false prevents it, null uses default
   *   (default: re-open on RAISE; ALL_IN only re-opens if it constitutes a full raise)
   */
  recordActionCompletion(playerId, action, reopensAction = null) {
    this.pendingActions.delete(playerId);

    const shouldReopen = reopensAction !== null
      ? reopensAction
      : action === ACTION.RAISE;

    if (shouldReopen) {
      this.lastAggressorId = playerId;
      this.pendingActions = new Set(this.getActivePlayers().map((p) => p.id));
      this.pendingActions.delete(playerId);
    }

    this.currentActorIndex = (this.currentActorIndex + 1) % this.activePlayers.length;
    this.advanceToNextActor();
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

    // Store exact position so community card dealing is always correct,
    // regardless of how many players were dealt to.
    this.deckIndex = cardIndex;

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

    if (this.currentActorId && playerId !== this.currentActorId) {
      throw new Error('Not player turn');
    }

    // For ALL_IN we need to determine after processing whether it re-opens betting
    let allInReopens = null;

    switch (action) {
      case ACTION.FOLD:
        this.folded.add(playerId);
        logger.debug('Player folded', { playerId });
        break;

      case ACTION.CHECK: {
        // Allow check when player has already matched the current bet (e.g. BB's option)
        const alreadyBetCheck = this.playerBetsThisRound[playerId] || 0;
        if (this.currentBet > 0 && alreadyBetCheck < this.currentBet) {
          throw new Error('Cannot check when bet is active');
        }
        logger.debug('Player checked', { playerId });
        break;
      }

      case ACTION.CALL: {
        const alreadyBetCall = this.playerBetsThisRound[playerId] || 0;
        const callAmount = Math.min(this.currentBet - alreadyBetCall, player.stack);
        if (callAmount <= 0) {
          throw new Error('Cannot call — no additional amount needed');
        }
        player.stack -= callAmount;
        this.playerBetsThisRound[playerId] = alreadyBetCall + callAmount;
        // pot tracked by engine's potCalculator
        logger.debug('Player called', { playerId, amount: callAmount });
        break;
      }

      case ACTION.RAISE: {
        const alreadyBetRaise = this.playerBetsThisRound[playerId] || 0;
        const minRaiseAmount = this.currentBet + this.minRaise;
        if (amount < minRaiseAmount) {
          throw new Error(
            `Raise must be at least ${minRaiseAmount} (current bet ${this.currentBet} + min raise ${this.minRaise})`,
          );
        }
        // amount is the total raise-to level; player only pays the net difference
        const netRaise = amount - alreadyBetRaise;
        if (netRaise <= 0 || netRaise > player.stack) {
          throw new Error('Insufficient chips for raise');
        }
        player.stack -= netRaise;
        this.playerBetsThisRound[playerId] = amount;
        this.minRaise = amount - this.currentBet; // next raise must be at least this increment
        this.currentBet = amount;
        // pot tracked by engine's potCalculator
        logger.debug('Player raised', { playerId, amount, minRaise: this.minRaise });
        break;
      }

      case ACTION.ALL_IN: {
        if (player.stack === 0) {
          throw new Error('Player has no chips to go all-in');
        }
        const alreadyBetAllIn = this.playerBetsThisRound[playerId] || 0;
        const allInNet = player.stack;
        const totalAllIn = alreadyBetAllIn + allInNet;
        player.stack = 0;
        this.playerBetsThisRound[playerId] = totalAllIn;
        if (totalAllIn > this.currentBet) {
          const allInIncrement = totalAllIn - this.currentBet;
          allInReopens = allInIncrement >= this.minRaise; // full raise re-opens betting
          if (allInReopens) {
            this.minRaise = allInIncrement;
          }
          this.currentBet = totalAllIn;
        } else {
          allInReopens = false; // all-in for less than call — never re-opens
        }
        // pot tracked by engine's potCalculator
        logger.debug('Player went all-in', { playerId, totalAllIn, reopens: allInReopens });
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.actions.push({
      playerId,
      action,
      amount,
      timestamp: new Date().toISOString(),
    });

    this.recordActionCompletion(playerId, action, allInReopens);
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
        this.minRaise = this.bigBlind;
        this.lastAggressorId = null;
        break;

      case GAME_STATE.FLOP:
        this.state = GAME_STATE.TURN;
        this.dealTurn();
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        this.lastAggressorId = null;
        break;

      case GAME_STATE.TURN:
        this.state = GAME_STATE.RIVER;
        this.dealRiver();
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        this.lastAggressorId = null;
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
   * Layout from deckIndex: [burn] [flop1] [flop2] [flop3] [burn] [turn] [burn] [river]
   */
  dealFlop() {
    const startIndex = this.deckIndex + 1; // skip burn card
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
    const startIndex = this.deckIndex + 5; // burn + 3 flop + burn
    this.communityCards.push(this.deck[startIndex]);
    logger.debug('Turn dealt', { card: this.deck[startIndex] });
  }

  /**
   * Deal river (5th community card)
   */
  dealRiver() {
    const startIndex = this.deckIndex + 7; // burn + 3 flop + burn + turn + burn
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
      currentActorId: this.currentActorId,
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
    this.pendingActions.clear();
    this.currentActorId = null;
    this.currentActorIndex = 0;
    this.lastAggressorId = null;

    this.initializeDeck();
    logger.debug('Game reset for next hand', { handNumber: this.handNumber });
  }
}

module.exports = {
  GameStateMachine,
  GAME_STATE,
  ACTION,
};
