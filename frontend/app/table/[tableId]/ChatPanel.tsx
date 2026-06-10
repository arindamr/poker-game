'use client';

import { useEffect, useRef, useState } from 'react';

export type ChatMessage = {
  id: string;
  playerId?: string;
  username?: string;
  message: string;
  timestamp: string;
};

export default function ChatPanel({
  messages,
  onSend,
  disabled,
  currentUserId,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
  currentUserId?: string | null;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-slate-300 font-semibold">Table Chat</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">
          {disabled ? 'Sit down to chat' : 'Live'}
        </div>
      </div>
      <div ref={scrollRef} className="h-44 overflow-y-auto space-y-1.5 text-xs pr-1">
        {messages.length === 0 ? (
          <div className="text-slate-500">No messages yet.</div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <span
                className={
                  msg.playerId === currentUserId
                    ? 'font-semibold text-emerald-300'
                    : 'font-semibold text-sky-300'
                }
              >
                {msg.username || 'Player'}:
              </span>{' '}
              <span className="text-slate-300 break-words">{msg.message}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={500}
          disabled={disabled}
          placeholder={disabled ? 'Join the table to chat' : 'Say something…'}
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400/70 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || draft.trim().length === 0}
          className="rounded-lg border border-emerald-400/60 bg-emerald-900/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-800/50 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
