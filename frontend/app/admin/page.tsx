'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiClient } from '@/lib/api';

type AdminTable = {
  id: string;
  name: string;
  status: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  currentPlayers: number;
  createdAt?: string;
  createdBy?: string | null;
  creatorEmail?: string | null;
  creatorUsername?: string | null;
};

export default function AdminTables() {
  const router = useRouter();
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
      return;
    }
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const client = new ApiClient();
      const response = await client.get('/api/v1/admin/tables');
      const rawTables = response.tables || response.data || [];
      const normalized = rawTables.map((table: any) => ({
        id: table.id,
        name: table.name,
        status: (table.status || '').toString().toLowerCase(),
        smallBlind: Number(table.small_blind ?? table.smallBlind ?? 0),
        bigBlind: Number(table.big_blind ?? table.bigBlind ?? 0),
        minBuyIn: Number(table.min_buy_in ?? table.minBuyIn ?? 0),
        maxBuyIn: Number(table.max_buy_in ?? table.maxBuyIn ?? 0),
        maxSeats: Number(table.max_seats ?? table.maxSeats ?? 0),
        currentPlayers: Number(table.current_players ?? table.currentPlayers ?? 0),
        createdAt: table.created_at,
        createdBy: table.created_by ?? table.createdBy ?? null,
        creatorEmail: table.creator_email ?? table.creatorEmail ?? null,
        creatorUsername: table.creator_username ?? table.creatorUsername ?? null,
      }));
      setTables(normalized);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tableId: string) => {
    setError('');
    setDeletingId(tableId);
    try {
      const client = new ApiClient();
      await client.delete(`/api/v1/admin/tables/${tableId}`);
      await loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to delete table');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-white font-semibold">Poker Game Admin</Link>
          <div className="flex gap-4 items-center">
            <Link href="/lobby" className="text-slate-300 hover:text-emerald-400">Lobby</Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-emerald-400">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">All Tables</h1>
          <button
            onClick={loadTables}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 p-4 bg-red-900 text-red-200 rounded-lg">{error}</div>
        ) : null}

        {loading ? (
          <div className="text-slate-400">Loading tables...</div>
        ) : tables.length === 0 ? (
          <div className="text-slate-400">No tables found.</div>
        ) : (
          <div className="space-y-4">
            {tables.map((table) => (
              <div key={table.id} className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                  <div>
                    <div className="text-white font-semibold">{table.name}</div>
                    <div className="text-xs text-slate-400">{table.id}</div>
                  </div>
                  <div className="text-slate-300 text-sm">
                    Blinds: ${table.smallBlind}/${table.bigBlind}
                  </div>
                  <div className="text-slate-300 text-sm">
                    Players: {table.currentPlayers}/{table.maxSeats}
                  </div>
                  <div className="text-slate-400 text-xs">
                    Creator: {table.creatorUsername || 'unknown'} ({table.creatorEmail || 'n/a'})
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDelete(table.id)}
                      disabled={deletingId === table.id}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg"
                    >
                      {deletingId === table.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Status: {table.status || 'unknown'}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
