const { ACTION } = require('./gameState');

const randomChoice = (choices) => {
  const total = choices.reduce((sum, c) => sum + c.weight, 0);
  const roll = Math.random() * total;
  let cursor = 0;
  for (const choice of choices) {
    cursor += choice.weight;
    if (roll <= cursor) return choice;
  }
  return choices[choices.length - 1];
};

const clampRaise = (amount, stack) => Math.max(0, Math.min(amount, stack));

/**
 * Simple bot strategy: weighted random with basic bet sizing.
 * Adds all-in responses for short stacks.
 */
const decideBotAction = (gameState, player, bigBlind) => {
  const currentBet = gameState.currentBet || 0;
  const stack = player.stack || 0;
  const baseBlind = Math.max(Number(bigBlind) || 1, 1);

  if (stack <= 0) {
    return { action: ACTION.CHECK, amount: 0 };
  }

  if (currentBet === 0) {
    const choice = randomChoice([
      { action: ACTION.CHECK, weight: 60 },
      { action: ACTION.RAISE, weight: 40 },
    ]);
    if (choice.action === ACTION.RAISE) {
      const raiseSize = Math.max(baseBlind * 2, 1);
      const raiseAmount = clampRaise(raiseSize, stack);
      return { action: ACTION.RAISE, amount: raiseAmount };
    }
    return { action: ACTION.CHECK, amount: 0 };
  }

  if (stack <= currentBet) {
    return { action: ACTION.ALL_IN, amount: stack };
  }

  const canRaise = stack > currentBet * 2;
  const choice = randomChoice([
    { action: ACTION.CALL, weight: 65 },
    { action: ACTION.FOLD, weight: 20 },
    { action: ACTION.RAISE, weight: canRaise ? 15 : 0 },
  ]);

  if (choice.action === ACTION.RAISE && canRaise) {
    const raiseAmount = clampRaise(currentBet * 2, stack);
    return { action: ACTION.RAISE, amount: raiseAmount };
  }

  if (choice.action === ACTION.CALL) {
    const callAmount = Math.min(currentBet, stack);
    return { action: ACTION.CALL, amount: callAmount };
  }

  return { action: ACTION.FOLD, amount: 0 };
};

module.exports = {
  decideBotAction,
};
