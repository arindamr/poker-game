export interface TableDetails {
  id: string;
  name: string;
  status: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  currentPlayers: number;
}

export interface SeatInfo {
  total: number;
  available: number;
  occupied: number;
  seats?: Array<{ position: number; occupied: boolean; playerId: string | null; username?: string | null; isBot?: boolean }>;
  yourSeat?: number | null;
}

export type GameState = {
  gameId?: string;
  state?: string;
  pot?: number;
  communityCards?: string[];
  players?: Array<{ id: string; seat: number; stack: number; folded?: boolean }>;
  activePlayers?: number;
  currentBet?: number;
  minRaise?: number;
  playerBetsThisRound?: Record<string, number>;
  currentActorId?: string | null;
  playerHand?: string[] | null;
};

export type GamePlayer = NonNullable<GameState['players']>[number];

export type ActionLogEntry = {
  id: string;
  message: string;
  street?: string;
  timestamp: string;
};

export const STREET_LABELS: Record<string, string> = {
  PRE_FLOP: 'Pre-Flop',
  FLOP: 'Flop',
  TURN: 'Turn',
  RIVER: 'River',
  SHOWDOWN: 'Showdown',
};

export type SeatActionBadge = {
  id: string;
  label: string;
  amount?: number;
  isBot?: boolean;
};

export type RoundResult = {
  gameId?: string;
  winners?: Array<{ playerId: string; hand?: string | { name?: string } }>;
  players?: Array<{
    playerId: string;
    seat: number;
    holeCards?: string[];
    winAmount?: number;
    bestHand?: string | null;
  }>;
  completedAt?: string;
};

export type NextHandStatus = {
  required: number;
  confirmed: number;
  hasConfirmed: boolean;
  waitingFor: Array<{ playerId: string; username: string; seat: number }>;
};

export const HAND_RANK_ORDER: Record<string, number> = {
  'Royal Flush': 10,
  'Straight Flush': 9,
  'Four of a Kind': 8,
  'Full House': 7,
  Flush: 6,
  Straight: 5,
  'Three of a Kind': 4,
  'Two Pair': 3,
  'One Pair': 2,
  'High Card': 1,
  Fold: 0,
  Folded: 0,
};

export const RING_LAYOUT_9: Array<{ x: number; y: number }> = [
  { x: 50, y: 6 },
  { x: 81, y: 16 },
  { x: 93, y: 43 },
  { x: 81, y: 73 },
  { x: 62, y: 89 },
  { x: 38, y: 89 },
  { x: 19, y: 73 },
  { x: 7, y: 43 },
  { x: 19, y: 16 },
];

export const getSeatPosition = (index: number, total: number) => {
  if (total === 9) {
    return RING_LAYOUT_9[index] || { x: 50, y: 50 };
  }
  const angle = ((Math.PI * 2) / Math.max(total, 2)) * index - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * 43,
    y: 50 + Math.sin(angle) * 40,
  };
};

export const formatCurrency = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '£0.00';
  }
  if (Math.abs(numeric) < 1) {
    return `${Math.round(numeric * 100)}p`;
  }
  return `£${numeric.toFixed(2)}`;
};

export const formatActionLabel = (rawAction: string) => {
  const action = rawAction.toUpperCase();
  if (action === 'ALL_IN') return 'All In';
  if (action === 'RAISE') return 'Raise';
  if (action === 'CALL') return 'Call';
  if (action === 'CHECK') return 'Check';
  if (action === 'BET') return 'Bet';
  if (action === 'FOLD') return 'Fold';
  return action || 'Act';
};

export const getActionBadgeClasses = (rawAction: string) => {
  const action = rawAction.toUpperCase();
  if (action === 'FOLD') {
    return 'bg-rose-600/95 border-rose-300/60 text-white';
  }
  if (action === 'CHECK') {
    return 'bg-slate-700/95 border-slate-300/40 text-slate-100';
  }
  if (action === 'CALL') {
    return 'bg-amber-500/95 border-amber-200/60 text-slate-950';
  }
  if (action === 'RAISE' || action === 'BET' || action === 'ALL_IN') {
    return 'bg-emerald-500/95 border-emerald-200/60 text-slate-950';
  }
  return 'bg-cyan-600/95 border-cyan-200/60 text-white';
};

export const getWinnerLabel = (
  winnerId: string,
  seats: SeatInfo | null,
  yourSeat: number | null | undefined,
) => {
  const seat = seats?.seats?.find((s) => s.playerId === winnerId);
  if (!seat) return `Player ${winnerId.slice(0, 6)}`;
  if (yourSeat !== undefined && seat.position === yourSeat) return 'You';
  return seat.username || `Seat ${seat.position + 1}`;
};

export const buildWinningExplanation = (
  roundResult: RoundResult,
  seats: SeatInfo | null,
  yourSeat: number | null | undefined,
) => {
  const winners = roundResult.winners || [];
  const players = roundResult.players || [];
  if (winners.length === 0 || players.length === 0) {
    return 'The hand completed, but winner details are unavailable.';
  }

  const winnerNames = winners.map((winner) => getWinnerLabel(winner.playerId, seats, yourSeat));
  const winnerHandName = typeof winners[0].hand === 'string'
    ? winners[0].hand
    : (winners[0].hand?.name || 'winning hand');

  const winnerPlayerIds = new Set(winners.map((winner) => winner.playerId));
  const opponents = players.filter((player) => !winnerPlayerIds.has(player.playerId));
  const allOpponentsFolded = opponents.length > 0
    && opponents.every((player) => !player.bestHand || player.bestHand === 'Folded' || player.bestHand === 'Fold');

  if (winnerHandName === 'Fold' || allOpponentsFolded) {
    return `${winnerNames.join(', ')} won because all other players folded before showdown.`;
  }

  const winnerRank = HAND_RANK_ORDER[winnerHandName] || 0;
  const bestOpponent = opponents
    .map((player) => player.bestHand || 'Folded')
    .sort((a, b) => (HAND_RANK_ORDER[b] || 0) - (HAND_RANK_ORDER[a] || 0))[0];
  const opponentRank = HAND_RANK_ORDER[bestOpponent || 'Folded'] || 0;

  if (winnerRank > opponentRank) {
    return `${winnerNames.join(', ')} won at showdown with ${winnerHandName}, which outranks ${bestOpponent || 'the opposing hand'}.`;
  }
  if (winnerRank === opponentRank) {
    return `${winnerNames.join(', ')} won with ${winnerHandName}; tie-break kickers/board combination decided the pot split.`;
  }
  return `${winnerNames.join(', ')} won at showdown with ${winnerHandName}.`;
};

