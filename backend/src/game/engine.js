const logger = require('../utils/logger');
const { GameStateMachine, GAME_STATE, ACTION } = require('./gameState');
const HandEvaluator = require('./handEvaluator');
const PotCalculator = require('./potCalculator');
const SecureShuffler = require('./shuffler');
const HandHistoryRecorder = require('./handHistoryRecorder');

/**
 * Main game engine that orchestrates poker gameplay
 */
class PokerEngine {
  constructor(gameId, tableId, players, smallBlind, bigBlind) {
    this.gameId = gameId;
    this.tableId = tableId;
    this.stateMachine = new GameStateMachine(
      gameId,
      tableId,
      players,
      smallBlind,
      bigBlind,
    );
    this.potCalculator = new PotCalculator();
    this.playerHands = {}; // Store hole cards
    this.actionIndex = 0;
    this.actionOrder = [];
    this.completed = false;
  }

  /**
   * Start a new hand
   */
  async startHand() {
    try {
      this.stateMachine.initializeDeck();

      // Record game in database
      const gameRecord = await HandHistoryRecorder.createGame(
        this.tableId,
        this.stateMachine.handNumber,
        this.stateMachine.smallBlind,
        this.stateMachine.bigBlind,
        this.stateMachine.activePlayers,
      );

      // Store RNG audit info
      const { hash: seedHash } = SecureShuffler.generateSeedHash();
      const deckHash = SecureShuffler.generateDeckHash(this.stateMachine.deck);
      await HandHistoryRecorder.recordRNGAudit(gameRecord, seedHash, deckHash);

      this.gameId = gameRecord;

      // Deal hole cards
      const holeCards = this.stateMachine.dealHoleCards();
      this.playerHands = holeCards;

      // Record hole cards in database
      for (const [playerId, cards] of Object.entries(holeCards)) {
        await HandHistoryRecorder.recordPlayerCards(
          this.gameId,
          playerId,
          cards[0],
          cards[1],
        );
      }

      logger.info('Hand started', {
        gameId: this.gameId,
        handNumber: this.stateMachine.handNumber,
        activePlayerCount: this.stateMachine.activePlayers.length,
      });

      return this.gameId;
    } catch (error) {
      logger.error('Error starting hand', { error: error.message });
      throw error;
    }
  }

  /**
   * Process player action and advance game
   */
  async processPlayerAction(playerId, action, amount = 0) {
    try {
      // Validate action
      const actionOrder = this.actionIndex++;

      // Record action in database
      await HandHistoryRecorder.recordAction(
        this.gameId,
        actionOrder,
        playerId,
        action,
        amount,
        this.stateMachine.state,
      );

      // Process in state machine
      this.stateMachine.processAction(playerId, action, amount);

      // Update pot
      if (action === ACTION.CALL || action === ACTION.RAISE || action === ACTION.ALL_IN) {
        this.potCalculator.addBet(playerId, amount);
      }

      logger.info('Player action processed', {
        gameId: this.gameId,
        playerId,
        action,
        amount,
        pot: this.potCalculator.getPot(),
      });

      // Check if hand is over (all but one folded)
      const activePlayers = this.stateMachine.getActivePlayers();
      if (activePlayers.length === 1) {
        return await this.endHand();
      }

      return this.getGameState();
    } catch (error) {
      logger.error('Error processing action', {
        gameId: this.gameId,
        playerId,
        action,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Advance to next betting round
   */
  async advanceStreet() {
    try {
      this.stateMachine.nextStreet();

      // Deal community cards
      if (this.stateMachine.state === GAME_STATE.FLOP) {
        await HandHistoryRecorder.recordCommunityCards(
          this.gameId,
          this.stateMachine.communityCards,
        );
      }

      logger.info('Street advanced', {
        gameId: this.gameId,
        state: this.stateMachine.state,
        communityCards: this.stateMachine.communityCards,
      });

      return this.getGameState();
    } catch (error) {
      logger.error('Error advancing street', { gameId: this.gameId, error: error.message });
      throw error;
    }
  }

  /**
   * End hand and determine winner(s)
   */
  async endHand() {
    try {
      const activePlayers = this.stateMachine.getActivePlayers();

      if (activePlayers.length === 1) {
        // Everyone folded - last player wins
        const winner = activePlayers[0];
        const results = [{
          playerId: winner.id,
          position: winner.seat,
          holeCards: null,
          bestHand: 'Fold',
          finalStack: winner.stack + this.potCalculator.getPot(),
          winAmount: this.potCalculator.getPot(),
          finishPosition: 1,
        }];

        // Losers
        this.stateMachine.players.forEach((player, index) => {
          if (player.id !== winner.id) {
            results.push({
              playerId: player.id,
              position: player.seat,
              holeCards: null,
              bestHand: 'Folded',
              finalStack: player.stack,
              winAmount: 0,
              finishPosition: results.length + 1,
            });
          }
        });

        await HandHistoryRecorder.recordGameResult(this.gameId, results);
        logger.info('Hand ended - winner by fold', { gameId: this.gameId, winnerId: winner.id });

        this.completed = true;
        return { winners: [winner], results };
      }

      // Showdown - evaluate hands
      if (this.stateMachine.state !== GAME_STATE.SHOWDOWN &&
          this.stateMachine.state !== GAME_STATE.HAND_COMPLETE) {
        this.stateMachine.state = GAME_STATE.SHOWDOWN;
      }

      // Evaluate each player's best hand
      const playerEvaluations = {};
      for (const player of activePlayers) {
        if (this.playerHands[player.id]) {
          const bestHand = HandEvaluator.findBestHand(
            this.playerHands[player.id],
            this.stateMachine.communityCards,
          );
          playerEvaluations[player.id] = bestHand;
        }
      }

      // Determine winner(s)
      const winners = [];
      let bestValue = -1;

      for (const [playerId, handEval] of Object.entries(playerEvaluations)) {
        if (handEval.value > bestValue) {
          bestValue = handEval.value;
          winners.length = 0;
          winners.push({
            playerId,
            hand: handEval,
          });
        } else if (handEval.value === bestValue) {
          winners.push({
            playerId,
            hand: handEval,
          });
        }
      }

      // Calculate rake
      const rake = this.potCalculator.calculateRake(this.potCalculator.getPot());

      // Distribute pot
      const distribution = this.potCalculator.distributePot(winners, rake);

      // Create results
      const results = [];
      let finishPosition = 1;

      for (const winner of winners) {
        const player = activePlayers.find(p => p.id === winner.playerId);
        results.push({
          playerId: winner.playerId,
          position: player.seat,
          holeCards: this.playerHands[winner.playerId].join(''),
          bestHand: winner.hand.name,
          finalStack: player.stack + distribution.distribution[winner.playerId],
          winAmount: distribution.distribution[winner.playerId],
          finishPosition,
        });
      }

      // Losers
      for (const player of activePlayers) {
        if (!winners.find(w => w.playerId === player.id)) {
          results.push({
            playerId: player.id,
            position: player.seat,
            holeCards: this.playerHands[player.id].join(''),
            bestHand: playerEvaluations[player.id].name,
            finalStack: player.stack,
            winAmount: 0,
            finishPosition: results.length + 1,
          });
        }
      }

      await HandHistoryRecorder.recordGameResult(this.gameId, results);

      logger.info('Hand ended - showdown', {
        gameId: this.gameId,
        winnerCount: winners.length,
        totalPot: distribution.totalPot,
        rake,
      });

      this.completed = true;
      return {
        winners: winners.map(w => ({
          playerId: w.playerId,
          hand: w.hand,
        })),
        results,
        distribution,
      };
    } catch (error) {
      logger.error('Error ending hand', { gameId: this.gameId, error: error.message });
      throw error;
    }
  }

  /**
   * Get current game state
   */
  getGameState() {
    return {
      gameId: this.gameId,
      state: this.stateMachine.state,
      pot: this.potCalculator.getPot(),
      communityCards: this.stateMachine.communityCards,
      players: this.stateMachine.activePlayers.map(p => ({
        id: p.id,
        seat: p.seat,
        stack: p.stack,
        folded: this.stateMachine.folded.has(p.id),
      })),
      activePlayers: this.stateMachine.getActivePlayers().length,
      currentBet: this.stateMachine.currentBet,
    };
  }

  /**
   * Validate player has valid hole cards
   */
  getPlayerHand(playerId) {
    return this.playerHands[playerId] || null;
  }

  /**
   * Check if hand is completed
   */
  isCompleted() {
    return this.completed;
  }
}

module.exports = PokerEngine;
