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

const renderCardBack = (key: string, compact = false) => {
  const sizeClasses = compact ? 'w-16 h-24' : 'w-20 h-28';
  return (
    <div
      key={key}
      className={`relative ${sizeClasses} rounded-xl border-2 border-rose-200/80 bg-gradient-to-br from-rose-400 to-rose-500 shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
    >
      <div className="absolute inset-1 rounded-lg border border-rose-100/70 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.3),transparent_45%),repeating-linear-gradient(45deg,rgba(255,255,255,0.14)_0,rgba(255,255,255,0.14)_6px,rgba(255,255,255,0.05)_6px,rgba(255,255,255,0.05)_12px)]" />
      <div className="absolute inset-0 flex items-center justify-center text-3xl text-white/90">∞</div>
    </div>
  );
};

const RING_LAYOUT_9: Array<{ x: number; y: number }> = [
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

const getSeatPosition = (index: number, total: number) => {
  if (total === 9) {
    return RING_LAYOUT_9[index] || { x: 50, y: 50 };
  }
  const angle = ((Math.PI * 2) / Math.max(total, 2)) * index - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * 43,
    y: 50 + Math.sin(angle) * 40,
  };
};

const formatCurrency = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '£0.00';
  }
  if (Math.abs(numeric) < 1) {
    return `${Math.round(numeric * 100)}p`;
  }
  return `£${numeric.toFixed(2)}`;
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
  const yourSeat = seats?.yourSeat;
  const yourPlayerState = yourSeat !== undefined && yourSeat !== null
    ? playersBySeat.get(yourSeat)
    : null;
  const minRaiseTarget = Math.max(
    canCall ? currentBet + (table?.bigBlind ?? 0) : (table?.bigBlind ?? 0),
    0,
  );

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
      }
      setNextHandStatus(response.nextHand || null);
      appendLog(`You ${action.toLowerCase()}${action === 'RAISE' ? ` to ${formatCurrency(amount)}` : ''}.`);
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
    });

    socket.on('PLAYER_ACTION_BROADCAST', (payload) => {
      if (payload?.playerId === userId) {
        return; // already logged locally when action is submitted
      }
      const actor = payload?.playerId === userId ? 'You' : (payload?.username || 'Player');
      const action = (payload?.action || '').toString().toLowerCase();
      const amount = Number(payload?.amount) > 0 ? ` ${formatCurrency(payload.amount)}` : '';
      appendLog(`${actor} ${action}${amount}.`, payload?.timestamp);
    });

    socket.on('BOT_ACTIONS', (payload) => {
      const actions: Array<{ action?: string; amount?: number }> = Array.isArray(payload?.actions)
        ? payload.actions
        : [];
      actions.forEach((botAction) => {
        const action = (botAction.action || '').toString().toLowerCase();
        const amount = Number(botAction.amount) > 0 ? ` ${formatCurrency(botAction.amount)}` : '';
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
    setActionLog([]);
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

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {loading ? (
          <div className="text-slate-400">Loading table...</div>
        ) : error ? (
          <div className="p-4 bg-red-900 text-red-200 rounded-lg">{error}</div>
        ) : table ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
              <div className="xl:col-span-3 rounded-[30px] border border-slate-600/70 bg-slate-900/80 shadow-[0_30px_70px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="relative px-5 py-4 md:px-8 md:py-5 border-b border-slate-700/60 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                  <div className="absolute inset-0 opacity-30 bg-[repeating-linear-gradient(120deg,transparent_0,transparent_22px,rgba(30,41,59,0.35)_22px,rgba(30,41,59,0.35)_44px)]" />
                  <div className="relative flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white">{table.name}</h2>
                      <p className="text-slate-400 text-sm">Status: {gameState?.state || table.status || 'waiting'}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="rounded-full border border-emerald-400/50 bg-emerald-950/60 px-3 py-1 text-emerald-200">
                        Blinds {formatCurrency(table.smallBlind)} / {formatCurrency(table.bigBlind)}
                      </div>
                      <div className="rounded-full border border-slate-500/70 bg-slate-800/80 px-3 py-1 text-slate-200">
                        Seats {seats?.occupied ?? table.currentPlayers}/{seats?.total ?? table.maxSeats}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative p-3 md:p-6 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.18),transparent_35%),radial-gradient(circle_at_80%_100%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(155deg,#0b1118_0%,#141a24_45%,#0a0f15_100%)]">
                  <div className="absolute inset-0 opacity-40 bg-[repeating-linear-gradient(45deg,transparent_0,transparent_12px,rgba(0,0,0,0.22)_12px,rgba(0,0,0,0.22)_24px)]" />
                  <div className="relative mx-auto w-full max-w-[1180px] aspect-[16/9] md:aspect-[16/8]">
                    <div className="absolute inset-[4%] rounded-[50%] border-2 border-emerald-100/45 bg-gradient-to-b from-slate-100/10 to-slate-800/50 shadow-[inset_0_0_30px_rgba(255,255,255,0.35),0_20px_45px_rgba(0,0,0,0.7)]" />
                    <div className="absolute inset-[9%] rounded-[49%] border border-emerald-950/70 bg-gradient-to-b from-emerald-600/85 via-emerald-700/90 to-emerald-950/95 shadow-[inset_0_0_24px_rgba(255,255,255,0.25)]" />
                    <div className="absolute inset-[15%] rounded-[48%] border border-emerald-300/30 bg-[radial-gradient(circle_at_50%_40%,rgba(167,243,208,0.72)_0%,rgba(74,222,128,0.5)_24%,rgba(22,163,74,0.78)_65%,rgba(4,120,87,0.95)_100%)] shadow-[inset_0_0_50px_rgba(255,255,255,0.16)]" />
                    <div className="absolute inset-[18%] rounded-[48%] opacity-30 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.35),transparent_32%),radial-gradient(circle_at_78%_58%,rgba(255,255,255,0.2),transparent_33%),repeating-radial-gradient(circle_at_35%_50%,transparent_0,transparent_14px,rgba(255,255,255,0.13)_14px,rgba(255,255,255,0.13)_16px)]" />

                  <div className="absolute left-1/2 top-[20%] -translate-x-1/2 text-center">
                    <div className="text-[11px] md:text-sm uppercase tracking-[0.18em] text-emerald-100/80">Total Pot</div>
                    <div className="mt-1 text-xl md:text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                      {formatCurrency(gameState?.pot ?? 0)}
                    </div>
                  </div>

                  <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 md:gap-3">
                    {(gameState?.communityCards || []).length === 0 ? (
                      Array.from({ length: 5 }).map((_, idx) => (
                        <div key={`empty-card-${idx}`} className="w-11 h-16 md:w-16 md:h-24 rounded-lg border border-white/25 bg-white/10 backdrop-blur-[1px]" />
                      ))
                    ) : (
                      (gameState?.communityCards || []).map((card, index) =>
                        renderPlayingCard(card, `community-${card}-${index}`, true),
                      )
                    )}
                  </div>

                  <div className="absolute left-1/2 top-[60%] -translate-x-1/2 flex items-end gap-1.5">
                    {[['£1', 'bg-sky-700'], ['25p', 'bg-cyan-700'], ['5p', 'bg-emerald-700'], ['1p', 'bg-amber-600']].map(([value, chipClass], idx) => (
                      <div key={`${value}-${idx}`} className="relative">
                        {Array.from({ length: 4 - (idx % 2) }).map((_, stack) => (
                          <div
                            key={`${value}-${idx}-stack-${stack}`}
                            className={`w-7 h-7 md:w-9 md:h-9 rounded-full border border-white/45 ${chipClass} shadow-[0_3px_8px_rgba(0,0,0,0.35)]`}
                            style={{ marginTop: stack === 0 ? 0 : -10 }}
                          />
                        ))}
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] md:text-xs text-white font-semibold">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {Array.from({ length: table.maxSeats }).map((_, index) => {
                    const seatInfo = seats?.seats?.find((seat) => seat.position === index);
                    const occupied = seatInfo?.occupied || false;
                    const isYou = seats?.yourSeat === index;
                    const playerState = playersBySeat.get(index);
                    const isActing = gameState?.currentActorId && playerState?.id === gameState.currentActorId;
                    const seatPos = getSeatPosition(index, table.maxSeats);
                    const seatLabel = occupied
                      ? (isYou ? 'You' : (seatInfo?.username || `Player ${index + 1}`))
                      : `Seat ${index + 1}`;
                    return (
                      <div
                        key={`ring-seat-${index}`}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-[140px] md:w-[190px]"
                        style={{ left: `${seatPos.x}%`, top: `${seatPos.y}%` }}
                      >
                        <div className={`rounded-full border px-2.5 py-2 md:px-3.5 md:py-3 backdrop-blur-md ${
                          occupied ? 'border-white/20 bg-slate-900/60 text-slate-100' : 'border-slate-500/50 bg-slate-900/35 text-slate-400'
                        } ${isActing ? 'ring-2 ring-amber-300/60' : ''}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-9 h-9 md:w-11 md:h-11 rounded-full border-2 ${
                              isYou ? 'border-emerald-300 bg-emerald-300/25' : 'border-slate-200/30 bg-slate-300/20'
                            }`} />
                            <div className="min-w-0">
                              <div className="truncate text-xs md:text-sm font-semibold">{seatLabel}</div>
                              <div className="text-[10px] md:text-xs text-slate-300/90">
                                {occupied ? formatCurrency(playerState?.stack ?? table.minBuyIn) : 'Open'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[9px] md:text-[10px] uppercase tracking-wide">
                            {isActing ? <span className="text-amber-300">To Act</span> : null}
                            {playerState?.folded ? <span className="text-rose-300">Folded</span> : null}
                            {seatInfo?.isBot ? <span className="text-emerald-300">Bot</span> : null}
                          </div>
                        </div>
                        {isYou && (gameState?.playerHand || []).length > 0 ? (
                          <div className="mt-2 flex justify-center gap-2">
                            {(gameState?.playerHand || []).map((card, cardIndex) =>
                              renderPlayingCard(card, `hero-${card}-${cardIndex}`, true),
                            )}
                          </div>
                        ) : occupied && !isYou && gameState?.state && gameState.state !== 'waiting' ? (
                          <div className="mt-2 flex justify-center gap-2">
                            {renderCardBack(`back-${index}-1`, true)}
                            {renderCardBack(`back-${index}-2`, true)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5 xl:sticky xl:top-24 self-start">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-slate-300 font-semibold">Action Log</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Live</div>
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                  {actionLog.length === 0 ? (
                    <div className="text-slate-500">No actions yet.</div>
                  ) : (
                    actionLog.slice(0, 12).map((entry) => (
                      <div key={entry.id} className="flex justify-between gap-2">
                        <span>{entry.message}</span>
                        <span className="text-slate-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 space-y-5">
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5">
                  <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className={`rounded-lg px-3 py-2 border ${isYourTurn ? 'border-emerald-400/60 bg-emerald-900/30 text-emerald-200' : 'border-slate-600 bg-slate-800/70 text-slate-300'}`}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Turn</div>
                      <div className="font-semibold mt-0.5">{isYourTurn ? 'Your move' : 'Waiting'}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2 border border-slate-600 bg-slate-800/70 text-slate-200">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Current Bet</div>
                      <div className="font-semibold mt-0.5">{formatCurrency(currentBet)}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2 border border-slate-600 bg-slate-800/70 text-slate-200">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Min Raise To</div>
                      <div className="font-semibold mt-0.5">{formatCurrency(minRaiseTarget)}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2 border border-slate-600 bg-slate-800/70 text-slate-200">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Your Stack</div>
                      <div className="font-semibold mt-0.5">{formatCurrency(yourPlayerState?.stack ?? 0)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <button
                      onClick={() => handlePlayerAction('CHECK')}
                      disabled={!isSeated || actionSubmitting || !canCheck || !isYourTurn}
                      className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-md text-sm font-medium"
                    >
                      Check
                    </button>
                    <button
                      onClick={() => handlePlayerAction('CALL')}
                      disabled={!isSeated || actionSubmitting || !canCall || !isYourTurn}
                      className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-md text-sm font-medium"
                    >
                      Call {canCall ? formatCurrency(currentBet) : ''}
                    </button>
                    <button
                      onClick={() => handlePlayerAction('FOLD')}
                      disabled={!isSeated || actionSubmitting || !isYourTurn}
                      className="px-3 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-800 text-white rounded-md text-sm font-medium"
                    >
                      Fold
                    </button>
                    <div className="col-span-2 md:col-span-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(e.target.value)}
                        className="w-full md:w-32 bg-slate-800 border border-slate-600 rounded px-2 py-2 text-slate-200 text-sm"
                        placeholder="Raise"
                      />
                      <button
                        onClick={() => handlePlayerAction('RAISE')}
                        disabled={!isSeated || actionSubmitting || invalidRaise || !isYourTurn}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 text-white rounded-md text-sm font-medium whitespace-nowrap"
                      >
                        Raise
                      </button>
                    </div>
                    <button
                      onClick={() => handlePlayerAction('ALL_IN')}
                      disabled={!isSeated || actionSubmitting || !isYourTurn}
                      className="px-3 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-800 text-white rounded-md text-sm font-medium"
                    >
                      All-in
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    {!isSeated ? 'Take a seat to act.' : null}
                    {isSeated && !isYourTurn ? ' Waiting for your turn.' : null}
                    {isSeated && isYourTurn && canCheck ? ' No active bet. Check or raise.' : null}
                    {isSeated && isYourTurn && canCall ? ` Calling requires ${formatCurrency(currentBet)}.` : null}
                    {isSeated && isYourTurn && invalidRaise ? ' Raise must exceed the current bet.' : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5">
                  <div className="flex flex-wrap gap-3 items-center">
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
                    <div className="text-slate-400 text-sm">
                      Buy-in: {formatCurrency(table.minBuyIn)} - {formatCurrency(table.maxBuyIn)}
                    </div>
                    {seats ? (
                      <div className="text-slate-400 text-sm">
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
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
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
                            {isActing ? <span className="text-[10px] uppercase text-amber-300">To Act</span> : null}
                            {seatInfo?.isBot ? <span className="text-[10px] uppercase text-emerald-300">Bot</span> : null}
                            {playerState ? <span className="text-[10px] uppercase text-slate-400">Stack: {formatCurrency(playerState.stack)}</span> : null}
                            {playerState?.folded ? <span className="text-[10px] uppercase text-rose-300">Folded</span> : null}
                            {seatInfo?.isBot ? (
                              <button
                                onClick={() => handleRemoveBot(index)}
                                className="text-[10px] uppercase text-rose-300 hover:text-rose-200"
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
              </div>
            </div>

            {roundResult ? (
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5">
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
                            <span>{player.bestHand || 'N/A'} {player.winAmount ? `(+${formatCurrency(player.winAmount)})` : ''}</span>
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
        ) : null}
      </main>
    </div>
  );
}
