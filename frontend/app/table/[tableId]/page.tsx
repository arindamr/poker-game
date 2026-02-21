'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiClient, API_URL } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

interface TableDetails {
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

interface SeatInfo {
  total: number;
  available: number;
  occupied: number;
  seats?: Array<{ position: number; occupied: boolean; playerId: string | null; username?: string | null; isBot?: boolean }>;
  yourSeat?: number | null;
}

type GameState = {
  gameId?: string;
  state?: string;
  pot?: number;
  communityCards?: string[];
  players?: Array<{ id: string; seat: number; stack: number; folded?: boolean }>;
  activePlayers?: number;
  currentBet?: number;
  currentActorId?: string | null;
  playerHand?: string[] | null;
};

type GamePlayer = NonNullable<GameState['players']>[number];

type ActionLogEntry = {
  id: string;
  message: string;
  timestamp: string;
};

type RoundResult = {
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

type NextHandStatus = {
  required: number;
  confirmed: number;
  hasConfirmed: boolean;
  waitingFor: Array<{ playerId: string; username: string; seat: number }>;
};

const HAND_RANK_ORDER: Record<string, number> = {
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

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const parseCard = (card: string) => {
  if (!card || card.length < 2) {
    return { rank: '?', suit: '?', isRed: false };
  }
  const suitKey = card[card.length - 1].toLowerCase();
  const rankKey = card.slice(0, -1).toUpperCase();
  return {
    rank: rankKey === 'T' ? '10' : rankKey,
    suit: SUIT_SYMBOLS[suitKey] || '?',
    isRed: suitKey === 'h' || suitKey === 'd',
  };
};

const PIP_LAYOUTS: Record<string, Array<[number, number]>> = {
  A: [[50, 50]],
  '2': [[50, 20], [50, 80]],
  '3': [[50, 20], [50, 50], [50, 80]],
  '4': [[25, 20], [75, 20], [25, 80], [75, 80]],
  '5': [[25, 20], [75, 20], [50, 50], [25, 80], [75, 80]],
  '6': [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  '7': [[25, 20], [75, 20], [50, 35], [25, 50], [75, 50], [25, 80], [75, 80]],
  '8': [[25, 20], [75, 20], [25, 40], [75, 40], [25, 60], [75, 60], [25, 80], [75, 80]],
  '9': [[25, 18], [75, 18], [25, 35], [75, 35], [50, 50], [25, 65], [75, 65], [25, 82], [75, 82]],
  '10': [[25, 16], [75, 16], [25, 32], [75, 32], [25, 48], [75, 48], [25, 64], [75, 64], [25, 80], [75, 80]],
};

const renderCardCenter = (rank: string, suit: string, textColor: string) => {
  if (rank === 'K' || rank === 'Q' || rank === 'J') {
    const roleLabel = rank === 'K' ? 'KING' : rank === 'Q' ? 'QUEEN' : 'JACK';
    const icon = rank === 'K' ? '♔' : rank === 'Q' ? '♕' : '⚔';
    return (
      <div className={`absolute inset-[18%] rounded-md border border-slate-300 bg-slate-50 flex flex-col items-center justify-center ${textColor}`}>
        <div className="text-2xl leading-none">{icon}</div>
        <div className="text-xl font-bold leading-none mt-1">{rank}</div>
        <div className="text-base leading-none mt-1">{suit}</div>
        <div className="text-[9px] tracking-widest mt-1">{roleLabel}</div>
      </div>
    );
  }

  const pips = PIP_LAYOUTS[rank] || [];
  const pipSize = rank === 'A' ? 'text-4xl' : rank === '10' ? 'text-lg' : 'text-2xl';
  return (
    <div className="absolute inset-0">
      {pips.map(([left, top], i) => (
        <span
          key={`${rank}-${left}-${top}-${i}`}
          className={`absolute -translate-x-1/2 -translate-y-1/2 leading-none ${pipSize} ${textColor}`}
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          {suit}
        </span>
      ))}
    </div>
  );
};

const renderPlayingCard = (card: string, key: string, compact = false) => {
  const parsed = parseCard(card);
  const textColor = parsed.isRed ? 'text-red-600' : 'text-slate-900';
  const sizeClasses = compact ? 'w-16 h-24' : 'w-20 h-28';
  const cornerRankClass = compact ? 'text-xs' : 'text-sm';
  const cornerSuitClass = compact ? 'text-sm' : 'text-base';

  return (
    <div
      key={key}
      className={`relative ${sizeClasses} rounded-xl border-2 border-slate-300 bg-gradient-to-b from-white to-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
    >
      <div className={`absolute left-2 top-1 leading-none font-bold ${textColor} ${cornerRankClass}`}>
        <div>{parsed.rank}</div>
        <div className={cornerSuitClass}>{parsed.suit}</div>
      </div>
      {renderCardCenter(parsed.rank, parsed.suit, textColor)}
      <div className={`absolute right-2 bottom-1 leading-none font-bold rotate-180 ${textColor} ${cornerRankClass}`}>
        <div>{parsed.rank}</div>
        <div className={cornerSuitClass}>{parsed.suit}</div>
      </div>
    </div>
  );
};

const getWinnerLabel = (
  winnerId: string,
  seats: SeatInfo | null,
  yourSeat: number | null | undefined,
) => {
  const seat = seats?.seats?.find((s) => s.playerId === winnerId);
  if (!seat) return `Player ${winnerId.slice(0, 6)}`;
  if (yourSeat !== undefined && seat.position === yourSeat) return 'You';
  return seat.username || `Seat ${seat.position + 1}`;
};

const buildWinningExplanation = (
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

export default function TablePage() {
  const router = useRouter();
  const params = useParams<{ tableId: string }>();
  const [table, setTable] = useState<TableDetails | null>(null);
  const [seats, setSeats] = useState<SeatInfo | null>(null);
  const [isSeated, setIsSeated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [seatAction, setSeatAction] = useState<'join' | 'leave' | null>(null);
  const [botCount, setBotCount] = useState(1);
  const [botAction, setBotAction] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [nextHandStatus, setNextHandStatus] = useState<NextHandStatus | null>(null);
  const [confirmingNextHand, setConfirmingNextHand] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState('');
  const socketRef = useRef<Socket | null>(null);

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  const playersBySeat = useMemo(() => {
    const map = new Map<number, GamePlayer>();
    if (gameState?.players) {
      gameState.players.forEach((player) => {
        map.set(player.seat, player);
      });
    }
    return map;
  }, [gameState]);

  const currentBet = Number(gameState?.currentBet ?? 0);
  const canCheck = currentBet === 0;
  const canCall = currentBet > 0;
  const raiseValue = Number(raiseAmount || 0);
  const invalidRaise = currentBet > 0 ? raiseValue <= currentBet : raiseValue <= 0;
  const isYourTurn = !!(userId && gameState?.currentActorId && userId === gameState.currentActorId);

  const fetchTable = async () => {
    const client = new ApiClient();
    const response = await client.get(`/api/v1/tables/${params.tableId}`);
    const t = response.table || response.data || {};
    setTable({
      id: t.id,
      name: t.name,
      status: (t.status || '').toString().toLowerCase(),
      smallBlind: Number(t.small_blind ?? t.smallBlind ?? 0),
      bigBlind: Number(t.big_blind ?? t.bigBlind ?? 0),
      minBuyIn: Number(t.min_buy_in ?? t.minBuyIn ?? 0),
      maxBuyIn: Number(t.max_buy_in ?? t.maxBuyIn ?? 0),
      maxSeats: Number(t.max_seats ?? t.maxSeats ?? 0),
      currentPlayers: Number(t.current_players ?? t.currentPlayers ?? 0),
    });
  };

  const fetchSeats = async () => {
    const client = new ApiClient();
    const response = await client.get(`/api/v1/tables/${params.tableId}/seats`);
    const s = response.seats || response.data || {};
    setSeats({
      total: Number(s.total ?? 0),
      available: Number(s.available ?? 0),
      occupied: Number(s.occupied ?? 0),
      seats: Array.isArray(s.seats) ? s.seats : [],
      yourSeat: s.yourSeat ?? null,
    });
    setIsSeated(s.yourSeat !== undefined && s.yourSeat !== null);
  };

  const fetchGameState = async () => {
    const client = new ApiClient();
    try {
      const response = await client.get(`/api/v1/tables/${params.tableId}/state`);
      setGameState(response.state || response.data || null);
      setRoundResult(response.roundResult || null);
      setNextHandStatus(response.nextHand || null);
      if (response.roundResult) {
        setActionLog([]);
      }
    } catch (err) {
      setGameState(null);
    }
  };

  const appendLog = (message: string, timestamp?: string) => {
    const entry: ActionLogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      timestamp: timestamp || new Date().toISOString(),
    };
    setActionLog((prev) => [entry, ...prev].slice(0, 20));
  };

  const handlePlayerAction = async (action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN') => {
    if (!table || actionSubmitting) return;
    setError('');
    setActionSubmitting(true);
    try {
      const amount = action === 'RAISE' ? Number(raiseAmount || 0) : 0;
      const client = new ApiClient();
      const response = await client.post(`/api/v1/tables/${table.id}/action`, {
        action,
        amount,
      });
      if (response.state) {
        setGameState(response.state);
      }
      if (response.roundResult) {
        setRoundResult(response.roundResult);
        setActionLog([]);
      }
      setNextHandStatus(response.nextHand || null);
      appendLog(`You ${action.toLowerCase()}${action === 'RAISE' ? ` to ${amount}` : ''}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit action');
    } finally {
      setActionSubmitting(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const load = async () => {
      try {
        await Promise.all([fetchTable(), fetchSeats(), fetchGameState()]);
      } catch (err: any) {
        setError(err.message || 'Failed to load table');
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(() => {
      fetchTable();
      fetchSeats();
      fetchGameState();
    }, 5000);

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('JOIN_TABLE', { tableId: params.tableId }, () => {});
    });

    socket.on('GAME_STATE_UPDATE', (payload) => {
      if (payload?.state) {
        setGameState((prev) => ({
          ...payload.state,
          playerHand: prev?.playerHand ?? null,
        }));
      }
    });

    socket.on('HAND_COMPLETED', (payload) => {
      if (payload?.result) {
        setRoundResult(payload.result);
        setActionLog([]);
      }
    });

    socket.on('NEXT_HAND_STATUS', (payload) => {
      if (payload?.nextHand) {
        setNextHandStatus(payload.nextHand);
      }
    });

    socket.on('NEXT_HAND_STARTED', () => {
      setRoundResult(null);
      setNextHandStatus(null);
      setActionLog([]);
    });

    socket.on('PLAYER_ACTION_BROADCAST', (payload) => {
      if (payload?.playerId === userId) {
        return; // already logged locally when action is submitted
      }
      const actor = payload?.playerId === userId ? 'You' : (payload?.username || 'Player');
      const action = (payload?.action || '').toString().toLowerCase();
      const amount = payload?.amount ? ` ${payload.amount}` : '';
      appendLog(`${actor} ${action}${amount}.`, payload?.timestamp);
    });

    socket.on('BOT_ACTIONS', (payload) => {
      const actions = Array.isArray(payload?.actions) ? payload.actions : [];
      actions.forEach((botAction) => {
        const action = (botAction.action || '').toString().toLowerCase();
        const amount = botAction.amount ? ` ${botAction.amount}` : '';
        appendLog(`Bot ${action}${amount}.`);
      });
    });

    socket.on('PLAYER_JOINED', (payload) => {
      appendLog(`${payload?.username || 'Player'} joined the table.`, payload?.timestamp);
      fetchSeats();
      fetchGameState();
    });

    socket.on('PLAYER_LEFT', (payload) => {
      appendLog(`${payload?.username || 'Player'} left the table.`, payload?.timestamp);
      fetchSeats();
      fetchGameState();
    });

    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.emit('LEAVE_TABLE', { tableId: params.tableId }, () => {});
        socketRef.current.disconnect();
      }
    };
  }, [params.tableId, router]);

  const handleJoin = async () => {
    if (!table) return;
    setError('');
    setSeatAction('join');
    try {
      const client = new ApiClient();
      await client.post(`/api/v1/tables/${table.id}/join`);
      await Promise.all([fetchTable(), fetchSeats(), fetchGameState()]);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSeatAction(null);
    }
  };

  const handleLeave = async () => {
    if (!table) return;
    setError('');
    setSeatAction('leave');
    try {
      const client = new ApiClient();
      await client.delete(`/api/v1/tables/${table.id}/leave`);
      await Promise.all([fetchTable(), fetchSeats(), fetchGameState()]);
    } catch (err: any) {
      setError(err.message || 'Failed to leave table');
    } finally {
      setSeatAction(null);
    }
  };

  const handleAddBots = async () => {
    if (!table) return;
    setError('');
    setBotAction(true);
    try {
      const client = new ApiClient();
      await client.post(`/api/v1/tables/${table.id}/bots`, { count: botCount });
      await Promise.all([fetchTable(), fetchSeats(), fetchGameState()]);
    } catch (err: any) {
      setError(err.message || 'Failed to add bots');
    } finally {
      setBotAction(false);
    }
  };

  const handleRemoveBot = async (seatPosition: number) => {
    if (!table) return;
    setError('');
    setBotAction(true);
    try {
      const client = new ApiClient();
      await client.delete(`/api/v1/tables/${table.id}/bots`, { seatPosition });
      await Promise.all([fetchTable(), fetchSeats(), fetchGameState()]);
    } catch (err: any) {
      setError(err.message || 'Failed to remove bot');
    } finally {
      setBotAction(false);
    }
  };

  const handleConfirmNextHand = async () => {
    if (!table || confirmingNextHand) return;
    setError('');
    setConfirmingNextHand(true);
    try {
      const client = new ApiClient();
      const response = await client.post(`/api/v1/tables/${table.id}/next-hand/ready`);
      if (response.started) {
        setRoundResult(null);
        setNextHandStatus(null);
        if (response.state) {
          setGameState(response.state);
        }
      } else {
        setRoundResult(response.roundResult || roundResult);
        setNextHandStatus(response.nextHand || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to confirm next hand');
    } finally {
      setConfirmingNextHand(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Link href="/lobby" className="text-emerald-400 hover:text-emerald-300 transition font-medium">
            ← Back to Lobby
          </Link>
          <h1 className="text-white font-semibold">Table</h1>
          <div />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {loading ? (
          <div className="text-slate-400">Loading table...</div>
        ) : error ? (
          <div className="p-4 bg-red-900 text-red-200 rounded-lg">{error}</div>
        ) : table ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-white mb-2">{table.name}</h2>
            <p className="text-slate-400 mb-6">Status: {table.status || 'unknown'}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
              <div>
                <div className="text-slate-500 text-sm">Blinds</div>
                <div className="text-lg font-semibold">${table.smallBlind}/${table.bigBlind}</div>
              </div>
              <div>
                <div className="text-slate-500 text-sm">Buy-in Range</div>
                <div className="text-lg font-semibold">${table.minBuyIn} - ${table.maxBuyIn}</div>
              </div>
              <div>
                <div className="text-slate-500 text-sm">Seats</div>
                <div className="text-lg font-semibold">{seats?.occupied ?? table.currentPlayers}/{seats?.total ?? table.maxSeats}</div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-slate-200 font-semibold">Game State</div>
                    <div className="text-xs text-slate-400">{gameState?.state || 'Waiting for players'}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                    <div>
                      <div className="text-slate-500 text-xs">Pot</div>
                      <div className="text-lg font-semibold">${gameState?.pot ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs">Current Bet</div>
                      <div className="text-lg font-semibold">${gameState?.currentBet ?? 0}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-slate-500 text-xs">Your Cards</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!isSeated ? (
                          <span className="text-slate-500">Take a seat to receive cards.</span>
                        ) : (gameState?.playerHand || []).length === 0 ? (
                          <span className="text-slate-500">Cards will appear when a hand starts.</span>
                        ) : (
                          (gameState?.playerHand || []).map((card, index) =>
                            renderPlayingCard(card, `player-${card}-${index}`),
                          )
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-slate-500 text-xs">Community Cards</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(gameState?.communityCards || []).length === 0 ? (
                          <span className="text-slate-500">No cards dealt yet.</span>
                        ) : (
                          (gameState?.communityCards || []).map((card, index) =>
                            renderPlayingCard(card, `community-${card}-${index}`, true),
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => handlePlayerAction('CHECK')}
                      disabled={!isSeated || actionSubmitting || !canCheck || !isYourTurn}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-md text-sm"
                    >
                      Check
                    </button>
                    <button
                      onClick={() => handlePlayerAction('CALL')}
                      disabled={!isSeated || actionSubmitting || !canCall || !isYourTurn}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-md text-sm"
                    >
                      Call
                    </button>
                    <button
                      onClick={() => handlePlayerAction('FOLD')}
                      disabled={!isSeated || actionSubmitting || !isYourTurn}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 text-white rounded-md text-sm"
                    >
                      Fold
                    </button>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(e.target.value)}
                        className="w-24 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 text-sm"
                        placeholder="Raise"
                      />
                      <button
                      onClick={() => handlePlayerAction('RAISE')}
                        disabled={!isSeated || actionSubmitting || invalidRaise || !isYourTurn}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 text-white rounded-md text-sm"
                      >
                        Raise
                      </button>
                    </div>
                    <button
                      onClick={() => handlePlayerAction('ALL_IN')}
                      disabled={!isSeated || actionSubmitting || !isYourTurn}
                      className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-800 text-white rounded-md text-sm"
                    >
                      All-in
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {!isSeated ? 'Take a seat to act.' : null}
                    {isSeated && !isYourTurn ? ' Waiting for your turn.' : null}
                    {isSeated && isYourTurn && canCall ? ` Call requires ${currentBet}.` : null}
                    {isSeated && isYourTurn && canCheck ? ' No bet to call. Check or raise.' : null}
                    {isSeated && isYourTurn && invalidRaise ? ' Raise must exceed the current bet.' : null}
                  </div>
                </div>

                <div className="text-slate-300 font-semibold mb-3">Seat Selection</div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: table.maxSeats }).map((_, index) => {
                    const seatInfo = seats?.seats?.find((seat) => seat.position === index);
                    const occupied = seatInfo?.occupied || false;
                    const isYou = seats?.yourSeat === index;
                    const label = seatInfo?.username || (occupied ? 'Player' : 'Open');
                    const isActing = gameState?.currentActorId && playersBySeat.get(index)?.id === gameState.currentActorId;
                    return (
                      <div
                        key={index}
                        className={`rounded-lg border p-4 text-center ${
                          isActing ? 'border-amber-400 bg-amber-500/10' : occupied ? 'border-slate-600 bg-slate-700' : 'border-emerald-500/40 bg-slate-900/50'
                        }`}
                      >
                        <div className="text-xs text-slate-400">Seat {index + 1}</div>
                        <div className={`mt-2 text-sm font-semibold ${occupied ? 'text-slate-300' : 'text-emerald-400'}`}>
                          {occupied ? (isYou ? 'You' : label) : 'Open'}
                        </div>
                        {isActing ? (
                          <div className="mt-1 text-[10px] uppercase text-amber-300">To Act</div>
                        ) : null}
                        {playersBySeat.get(index)?.folded ? (
                          <div className="mt-1 text-[10px] uppercase text-red-300">Folded</div>
                        ) : null}
                        {seatInfo?.isBot ? (
                          <div className="mt-1 text-[10px] uppercase text-emerald-300">Bot</div>
                        ) : null}
                        {seatInfo?.isBot ? (
                          <button
                            onClick={() => handleRemoveBot(index)}
                            className="mt-2 w-full text-xs bg-red-600 hover:bg-red-700 text-white rounded-md py-1"
                            disabled={botAction}
                          >
                            Remove Bot
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleJoin}
                    disabled={isSeated || table.currentPlayers >= table.maxSeats || seatAction === 'join'}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg transition font-medium"
                  >
                    {seatAction === 'join' ? 'Joining...' : isSeated ? 'Seated' : 'Take Seat'}
                  </button>
                  <button
                    onClick={handleLeave}
                    disabled={!isSeated || seatAction === 'leave'}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 text-white rounded-lg transition font-medium"
                  >
                    {seatAction === 'leave' ? 'Leaving...' : 'Leave Seat'}
                  </button>
                  {seats ? (
                    <div className="ml-auto text-slate-400 text-sm self-center">
                      {seats.available} open / {seats.total} seats
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex items-center gap-3 text-sm text-slate-400">
                  <label className="text-slate-300">Add bots:</label>
                  <select
                    value={botCount}
                    onChange={(e) => setBotCount(Math.max(1, Math.min(5, Number(e.target.value))))}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200"
                  >
                    {[1, 2, 3, 4, 5].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddBots}
                    disabled={botAction}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-md"
                  >
                    {botAction ? 'Adding...' : 'Add'}
                  </button>
                  <span className="text-xs text-slate-500">Up to 5 bots per table.</span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                  <div className="text-slate-300 font-semibold mb-3">Player List</div>
                  <div className="space-y-2 text-sm">
                    {Array.from({ length: table.maxSeats }).map((_, index) => {
                      const seatInfo = seats?.seats?.find((seat) => seat.position === index);
                      const occupied = seatInfo?.occupied || false;
                      const playerState = playersBySeat.get(index);
                      const isActing = gameState?.currentActorId && playerState?.id === gameState.currentActorId;
                      const label = occupied
                        ? (seats?.yourSeat === index ? 'You' : (seatInfo?.username || `Player ${index + 1}`))
                        : 'Empty';
                      return (
                        <div
                          key={index}
                          className={`flex items-center justify-between rounded-md px-3 py-2 ${
                            occupied ? 'bg-slate-800 text-slate-200' : 'bg-slate-800/40 text-slate-500'
                          }`}
                        >
                          <span>Seat {index + 1}</span>
                          <span className="flex items-center gap-2">
                            {label}
                            {isActing ? (
                              <span className="text-[10px] uppercase text-amber-300">To Act</span>
                            ) : null}
                            {seatInfo?.isBot ? (
                              <span className="text-[10px] uppercase text-emerald-300">Bot</span>
                            ) : null}
                            {playerState ? (
                              <span className="text-[10px] uppercase text-slate-400">Stack: {playerState.stack}</span>
                            ) : null}
                            {playerState?.folded ? (
                              <span className="text-[10px] uppercase text-red-300">Folded</span>
                            ) : null}
                            {seatInfo?.isBot ? (
                              <button
                                onClick={() => handleRemoveBot(index)}
                                className="text-[10px] uppercase text-red-300 hover:text-red-200"
                                disabled={botAction}
                              >
                                Remove
                              </button>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                  <div className="text-slate-300 font-semibold mb-3">Action Log</div>
                  <div className="space-y-2 text-xs text-slate-400 max-h-64 overflow-y-auto">
                    {actionLog.length === 0 ? (
                      <div className="text-slate-500">No actions yet.</div>
                    ) : (
                      actionLog.map((entry) => (
                        <div key={entry.id} className="flex justify-between gap-2">
                          <span>{entry.message}</span>
                          <span className="text-slate-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {roundResult ? (
                  <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                    <div className="text-slate-300 font-semibold mb-3">Last Hand Result</div>
                    <div className="text-xs text-amber-200 bg-amber-900/20 border border-amber-700/30 rounded-md p-2 mb-3">
                      {buildWinningExplanation(roundResult, seats, seats?.yourSeat)}
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      Winner(s): {(roundResult.winners || []).map((winner) => {
                        const seatInfo = seats?.seats?.find((seat) => seat.playerId === winner.playerId);
                        return seatInfo?.username || (seats?.yourSeat !== undefined && seats?.seats?.find((seat) => seat.playerId === winner.playerId)?.position === seats?.yourSeat ? 'You' : `Player ${winner.playerId.slice(0, 6)}`);
                      }).join(', ') || 'N/A'}
                    </div>
                    <div className="space-y-3">
                      {(roundResult.players || [])
                        .slice()
                        .sort((a, b) => a.seat - b.seat)
                        .map((player) => {
                          const seatInfo = seats?.seats?.find((seat) => seat.playerId === player.playerId);
                          const label = seatInfo?.username
                            || (seats?.yourSeat === player.seat ? 'You' : `Player ${player.seat + 1}`);
                          return (
                            <div key={`round-${player.playerId}`} className="rounded-md bg-slate-800/70 p-3">
                              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                                <span>Seat {player.seat + 1}: {label}</span>
                                <span>{player.bestHand || 'N/A'} {player.winAmount ? `(+${player.winAmount})` : ''}</span>
                              </div>
                              <div className="flex gap-2">
                                {(player.holeCards || []).map((card, index) =>
                                  renderPlayingCard(card, `reveal-${player.playerId}-${card}-${index}`, true),
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    <div className="mt-4 border-t border-slate-700 pt-3">
                      <div className="text-xs text-slate-400 mb-2">
                        Next hand confirmations: {nextHandStatus?.confirmed ?? 0}/{nextHandStatus?.required ?? 0}
                      </div>
                      {nextHandStatus?.waitingFor?.length ? (
                        <div className="text-xs text-slate-500 mb-3">
                          Waiting for: {nextHandStatus.waitingFor.map((p) => p.username || `Seat ${p.seat + 1}`).join(', ')}
                        </div>
                      ) : null}
                      <button
                        onClick={handleConfirmNextHand}
                        disabled={confirmingNextHand || !!nextHandStatus?.hasConfirmed}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white rounded-md text-sm"
                      >
                        {nextHandStatus?.hasConfirmed
                          ? 'Confirmed'
                          : confirmingNextHand
                            ? 'Confirming...'
                            : 'Ready For Next Hand'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
