import React from 'react';

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

export const parseCard = (card: string) => {
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

export const renderPlayingCard = (card: string, key: string, compact = false) => {
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

export const renderCardBack = (key: string, compact = false) => {
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

