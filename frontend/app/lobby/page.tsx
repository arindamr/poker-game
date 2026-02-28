'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiClient } from '@/lib/api';

interface GameTable {
  id: number;
  name: string;
  tableNumber: number;
  buyin: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  createdBy?: string;
}

const formatSterling = (value: unknown) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '£0.00';
  if (Math.abs(numeric) < 1) {
    return `${Math.round(numeric * 100)}p`;
  }
  return `£${numeric.toFixed(2)}`;
};

export default function Lobby() {
  const router = useRouter();
  const [tables, setTables] = useState<GameTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableBuyin, setNewTableBuyin] = useState(100);
  const [joiningTableId, setJoiningTableId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'running'>('all');
  const pageSize = 10;

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const name = localStorage.getItem('userName');
    setUserName(name || 'Player');
    setUserId(localStorage.getItem('userId'));

    loadTables();
    const interval = setInterval(loadTables, 5000);
    return () => clearInterval(interval);
  }, [router, page]);

  const loadTables = async () => {
    try {
      const client = new ApiClient();
      const offset = (page - 1) * pageSize;
      const response = await client.get(`/api/v1/tables?limit=${pageSize + 1}&offset=${offset}`);
      const rawTables = response.tables || response.data || [];
      setHasMore(rawTables.length > pageSize);
      const normalized = rawTables.slice(0, pageSize).map((table: any) => ({
        id: table.id,
        name: table.name,
        tableNumber: table.table_number || table.tableNumber || table.id,
        buyin: table.buyin || table.min_buy_in || table.minBuyIn || 0,
        smallBlind: table.small_blind || table.smallBlind || 0,
        bigBlind: table.big_blind || table.bigBlind || 0,
        maxPlayers: table.max_seats || table.maxPlayers || 0,
        currentPlayers: table.current_players || table.currentPlayers || 0,
        status: (table.status || '').toString().toLowerCase(),
        createdBy: table.created_by || table.createdBy,
      }));
      if (normalized.length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      setTables(normalized);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName || newTableBuyin <= 0) {
      setError('Please enter valid table details');
      return;
    }

    setCreatingTable(true);
    try {
      const client = new ApiClient();
      const minBuyIn = newTableBuyin;
      const maxBuyIn = newTableBuyin * 2;

      await client.post('/api/v1/tables', {
        name: newTableName,
        smallBlind: newTableBuyin / 20,
        bigBlind: newTableBuyin / 10,
        minBuyIn,
        maxBuyIn,
        maxSeats: 6,
      });

      setNewTableName('');
      setNewTableBuyin(100);
      setError('');
      loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
    } finally {
      setCreatingTable(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    router.push('/');
  };

  const handleDeleteTable = async (tableId: string) => {
    setError('');
    try {
      const client = new ApiClient();
      await client.delete(`/api/v1/tables/${tableId}`);
      await loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to delete table');
    }
  };

  const handleJoinTable = async (tableId: string) => {
    setError('');
    setJoiningTableId(tableId);
    try {
      const client = new ApiClient();
      await client.post(`/api/v1/tables/${tableId}/join`);
      router.push(`/table/${tableId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setJoiningTableId(null);
    }
  };

  const visibleTables = statusFilter === 'all'
    ? tables
    : tables.filter((table) => table.status === statusFilter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold text-white">♠️</span>
              </div>
              <h1 className="text-2xl font-bold text-white">Poker Game</h1>
            </Link>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-slate-300">👤 {userName}</span>
            <Link
              href="/dashboard"
              className="px-6 py-2 text-white hover:text-emerald-400 transition font-medium"
            >
              Metrics
            </Link>
            <button
              onClick={handleLogout}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Table Form */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 sticky top-6">
              <h2 className="text-2xl font-bold text-white mb-6">Create Table</h2>

              {error && (
                <div className="mb-4 p-4 bg-red-900 text-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateTable} className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="High Rollers"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    disabled={creatingTable}
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Buy-in Amount (£)
                  </label>
                  <input
                    type="number"
                    value={newTableBuyin}
                    onChange={(e) => setNewTableBuyin(Math.max(10, parseInt(e.target.value) || 0))}
                    min="10"
                    max="10000"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    disabled={creatingTable}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-slate-400">
                  <div>Small Blind: {formatSterling(newTableBuyin / 20)}</div>
                  <div>Big Blind: {formatSterling(newTableBuyin / 10)}</div>
                </div>

                <button
                  type="submit"
                  disabled={creatingTable || !newTableName}
                  className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-lg transition font-semibold"
                >
                  {creatingTable ? 'Creating...' : 'Create Table'}
                </button>
              </form>
            </div>
          </div>

          {/* Tables List */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-white mb-6">Available Tables</h2>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
              </div>
            ) : visibleTables.length === 0 ? (
              <div className="bg-slate-800 rounded-lg p-12 text-center border border-slate-700">
                <p className="text-slate-400 text-lg">No tables available</p>
                <p className="text-slate-500 text-sm mt-2">Create a new table to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleTables.map((table) => (
                  <div
                    key={table.id}
                    className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-emerald-500 transition"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                      <div>
                        <h3 className="text-lg font-bold text-white">{table.name}</h3>
                        <p className="text-slate-400 text-sm">Table #{table.tableNumber}</p>
                      </div>

                      <div className="text-center">
                        <p className="text-slate-400 text-sm">Buy-in</p>
                        <p className="text-emerald-400 font-semibold text-lg">{formatSterling(table.buyin)}</p>
                      </div>

                      <div className="text-center">
                        <p className="text-slate-400 text-sm">Blinds</p>
                        <p className="text-slate-300 font-semibold">
                          {formatSterling(table.smallBlind)}/{formatSterling(table.bigBlind)}
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-slate-400 text-sm">Players</p>
                        <div className="flex items-center justify-center gap-2">
                          <p className="text-emerald-400 font-semibold text-lg">
                            {table.currentPlayers}/{table.maxPlayers}
                          </p>
                          <div className="flex gap-1">
                            {Array.from({ length: Math.min(table.currentPlayers, 3) }).map((_, i) => (
                              <div
                                key={i}
                                className="w-2 h-2 rounded-full bg-emerald-400"
                              ></div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          disabled={table.currentPlayers >= table.maxPlayers}
                          onClick={() => handleJoinTable(String(table.id))}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg transition font-medium"
                        >
                          {table.currentPlayers >= table.maxPlayers
                            ? 'Full'
                            : joiningTableId === String(table.id)
                              ? 'Joining...'
                              : 'Join'}
                        </button>
                        {userId && table.createdBy === userId ? (
                          <button
                            onClick={() => handleDeleteTable(String(table.id))}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <p className="text-slate-400 text-sm">
                        Status: <span className="text-emerald-400 font-semibold">{table.status}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-slate-400 text-sm">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'all' | 'waiting' | 'running');
                    setPage(1);
                  }}
                  className="bg-slate-800 border border-slate-600 rounded px-3 py-1 text-slate-200 text-sm"
                >
                  <option value="all">All</option>
                  <option value="waiting">Waiting</option>
                  <option value="running">Running</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded text-sm"
                >
                  Previous
                </button>
                <span className="text-slate-400 text-sm">Page {page}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
