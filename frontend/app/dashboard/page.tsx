'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { systemAPI } from '@/lib/api';

interface Metrics {
  [key: string]: any;
}

export default function Dashboard() {
  const formatMoney = (value: unknown) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return '0.00';
    }
    return numeric.toFixed(2);
  };
  const normalizeMetrics = (raw: any) => {
    if (!raw || typeof raw !== 'object') return {};
    const normalized: Record<string, any> = {};
    Object.entries(raw).forEach(([key, value]) => {
      if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
        normalized[key] = (value as any).value;
      } else {
        normalized[key] = value;
      }
    });
    return normalized;
  };
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics>({});
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [healthRes, metricsRes] = await Promise.all([
        systemAPI.getHealth().catch(() => null),
        systemAPI.getMetrics().catch(() => null),
      ]);

      if (healthRes) setHealth(healthRes);
      if (metricsRes) setMetrics(normalizeMetrics(metricsRes));
      setError('');
    } catch (err) {
      setError('Failed to fetch metrics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-700 px-6 py-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-white">♠️</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Poker Game</h1>
          </div>
          <div className="flex gap-4 items-center">
            <Link
              href="/lobby"
              className="px-4 py-2 text-white hover:text-emerald-400 transition font-medium"
            >
              Lobby
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 text-white hover:text-amber-300 transition font-medium"
            >
              Admin
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* System Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">System Status</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {health?.status ? '✅ Healthy' : '⚠️ Checking...'}
                </p>
              </div>
              <div className="text-4xl">🎰</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Active Tables</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.['game.active_tables'] || 0}
                </p>
              </div>
              <div className="text-4xl">🃏</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Total Players</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.['game.total_players'] || 0}
                </p>
              </div>
              <div className="text-4xl">👥</div>
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* API Metrics */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">📊 API Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Requests</span>
                <span className="text-white font-semibold">
                  {metrics?.['api.request.count'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Avg Duration (ms)</span>
                <span className="text-white font-semibold">
                  {metrics?.['api.request.duration']?.mean
                    ? Math.round(metrics['api.request.duration'].mean)
                    : 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Errors</span>
                <span className="text-red-400 font-semibold">
                  {metrics?.['api.request.errors'] || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Security Metrics */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🔒 Security Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Auth Attempts</span>
                <span className="text-white font-semibold">
                  {metrics?.['security.auth_attempts'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Failed Auth</span>
                <span className="text-orange-400 font-semibold">
                  {metrics?.['security.failed_auth'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">2FA Enabled</span>
                <span className="text-emerald-400 font-semibold">
                  {metrics?.['security.2fa_enabled'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Cheat Detections</span>
                <span className="text-red-400 font-semibold">
                  {metrics?.['security.cheat_detections'] || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Game Metrics */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🎮 Game Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Avg Hand Duration (ms)</span>
                <span className="text-white font-semibold">
                  {metrics?.['game.hand_duration']?.mean
                    ? Math.round(metrics['game.hand_duration'].mean)
                    : 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Rate Limit Hits</span>
                <span className="text-yellow-400 font-semibold">
                  {metrics?.['security.rate_limit_hits'] || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Database Metrics */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🗄️ Database Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Active Connections</span>
                <span className="text-white font-semibold">
                  {metrics?.['database.pool_connections'] || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Avg Query Duration (ms)</span>
                <span className="text-white font-semibold">
                  {metrics?.['database.query_duration']?.mean
                    ? Math.round(metrics['database.query_duration'].mean)
                    : 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Connection Errors</span>
                <span className="text-red-400 font-semibold">
                  {metrics?.['database.connection_errors'] || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* WebSocket Metrics */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">⚡ WebSocket & Financial</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Active Connections</p>
              <p className="text-xl font-bold text-white">
                {metrics?.['websocket.connections.active'] || 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Messages Sent</p>
              <p className="text-xl font-bold text-white">
                {metrics?.['websocket.messages.sent'] || 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Messages Received</p>
              <p className="text-xl font-bold text-white">
                {metrics?.['websocket.messages.received'] || 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Wagered</p>
              <p className="text-xl font-bold text-emerald-400">
                ${formatMoney(metrics?.['financial.total_wagered'])}
              </p>
            </div>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          📊 Metrics auto-refresh every 5 seconds
        </div>
      </main>
    </div>
  );
}
