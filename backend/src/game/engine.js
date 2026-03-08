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
    this.lastHandSummary = null;
  }

  /**
   * Start a new hand
   */
  async startHand() {
    try {
      this.completed = false;
      this.lastHandSummary = null;
      this.stateMachine.startHand();
      this.potCalculator.reset();
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

      // Post blinds and update pot
      const blindBets = this.stateMachine.postBlinds();
      blindBets.forEach((blind) => {
        if (blind.amount > 0) {
          this.potCalculator.addBet(blind.playerId, blind.amount);
        }
      });

      // Start betting round (pre-flop)
      this.stateMachine.state = GAME_STATE.PRE_FLOP;
      this.stateMachine.startBettingRound(this.stateMachine.getStartIndexPreflop());

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
      const numericAmount = Number(amount) || 0;
      const actingPlayer = this.stateMachine.players.find((p) => p.id === playerId);
      const preStack = actingPlayer ? actingPlayer.stack : 0;
      const actionOrder = this.actionIndex++;

      // Process in state machine (modifies player.stack in place)
      this.stateMachine.processAction(playerId, action, numericAmount);

      // Net contribution = chips actually moved from player to pot
      const postStack = actingPlayer ? actingPlayer.stack : 0;
      const netContribution = preStack - postStack;

      // Record action in database
      await HandHistoryRecorder.recordAction(
        this.gameId,
        actionOrder,
        playerId,
        action,
        netContribution,
        this.stateMachine.state,
      );

      // Update pot tracker with net new money
      if (netContribution > 0) {
        this.potCalculator.addBet(playerId, netContribution);
      }

      logger.info('Player action processed', {
        gameId: this.gameId,
        playerId,
        action,
        amount: netContribution,
        pot: this.potCalculator.getPot(),
      });

      // Check if hand is over (all but one folded)
      const activePlayers = this.stateMachine.getActivePlayers();
      if (activePlayers.length === 1) {
        return await this.endHand();
      }

      // Advance streets when betting round completes
      if (this.stateMachine.isBettingRoundComplete()) {
        if (this.stateMachine.state === GAME_STATE.RIVER) {
          return await this.endHand();
        }
        await this.advanceStreet();
        this.stateMachine.startBettingRound(this.stateMachine.getStartIndexPostflop());
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
          0,
        );
      }
      if (this.stateMachine.state === GAME_STATE.TURN) {
        await HandHistoryRecorder.recordCommunityCards(
          this.gameId,
          [this.stateMachine.communityCards[3]],
          3,
        );
      }
      if (this.stateMachine.state === GAME_STATE.RIVER) {
        await HandHistoryRecorder.recordCommunityCards(
          this.gameId,
          [this.stateMachine.communityCards[4]],
          4,
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
          holeCards: (this.playerHands[winner.id] || []).join(''),
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
              holeCards: (this.playerHands[player.id] || []).join(''),
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
        this.lastHandSummary = {
          gameId: this.gameId,
          winners: [{ playerId: winner.id, hand: 'Fold' }],
          results,
        };
        return this.lastHandSummary;
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

      // Calculate side pots for all-in scenarios; pass folded set so only active players can win
      const sidePots = this.potCalculator.calculateSidePots(this.stateMachine.folded);

      // Distribute pot (handles side pots if present)
      const distribution = this.potCalculator.distributePot(winners, rake, {
        sidePots,
        handEvaluations: playerEvaluations,
      });

      // Create results for all active players based on distribution
      const results = [];
      const payoutByPlayer = distribution.distribution || {};
      const sortedPlayers = [...activePlayers].sort(
        (a, b) => (payoutByPlayer[b.id] || 0) - (payoutByPlayer[a.id] || 0),
      );

      sortedPlayers.forEach((player, index) => {
        const winAmount = payoutByPlayer[player.id] || 0;
        const bestHand = playerEvaluations[player.id]?.name || 'Unknown';
        results.push({
          playerId: player.id,
          position: player.seat,
          holeCards: this.playerHands[player.id].join(''),
          bestHand,
          finalStack: player.stack + winAmount,
          winAmount,
          finishPosition: index + 1,
        });
      });

      // Include folded/inactive players so end-of-hand reveal can show everyone.
      this.stateMachine.players.forEach((player) => {
        if (!results.find((result) => result.playerId === player.id)) {
          results.push({
            playerId: player.id,
            position: player.seat,
            holeCards: (this.playerHands[player.id] || []).join(''),
            bestHand: 'Folded',
            finalStack: player.stack,
            winAmount: 0,
            finishPosition: results.length + 1,
          });
        }
      });

      await HandHistoryRecorder.recordGameResult(this.gameId, results);

      logger.info('Hand ended - showdown', {
        gameId: this.gameId,
        winnerCount: winners.length,
        totalPot: distribution.totalPot,
        rake,
      });

      this.completed = true;
      this.lastHandSummary = {
        gameId: this.gameId,
        winners: winners.map(w => ({
          playerId: w.playerId,
          hand: w.hand,
        })),
        results,
        distribution,
      };
      return this.lastHandSummary;
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
      minRaise: this.stateMachine.minRaise,
      playerBetsThisRound: { ...this.stateMachine.playerBetsThisRound },
      currentActorId: this.stateMachine.currentActorId,
      buttonPosition: this.stateMachine.buttonPosition,
    };
  }

  /**
   * Get game state with private hand for a specific player
   */
  getGameStateForPlayer(playerId) {
    const baseState = this.getGameState();
    return {
      ...baseState,
      playerHand: playerId ? this.getPlayerHand(playerId) : null,
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

  /**
   * Get end-of-hand summary with all players and revealed hole cards.
   */
  getRoundSummary() {
    if (!this.lastHandSummary) {
      return null;
    }

    const allPlayers = this.stateMachine.players.map((player) => {
      const holeCards = this.playerHands[player.id] || [];
      const result = this.lastHandSummary.results?.find((entry) => entry.playerId === player.id);
      return {
        playerId: player.id,
        seat: player.seat,
        stack: player.stack,
        holeCards,
        winAmount: result?.winAmount || 0,
        bestHand: result?.bestHand || null,
        finishPosition: result?.finishPosition || null,
      };
    });

    return {
      ...this.lastHandSummary,
      players: allPlayers,
      completedAt: new Date().toISOString(),
    };
  }
}

module.exports = PokerEngine;
