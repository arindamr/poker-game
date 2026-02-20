'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    setIsLoggedIn(!!token);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-white">♠️</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Poker Game</h1>
          </div>
          <div className="flex gap-4">
            {isLoggedIn ? (
              <>
                <Link
                  href="/lobby"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
                >
                  Lobby
                </Link>
                <Link
                  href="/dashboard"
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition font-medium border border-slate-700"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-6 py-2 text-white hover:text-emerald-400 transition font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-bold text-white mb-4">
            Welcome to Poker Game 🎰
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Experience professional-grade poker with cutting-edge security features,
            <br />
            anti-cheat detection, and real-time gameplay.
          </p>
          {!isLoggedIn && (
            <div className="flex gap-4 justify-center">
              <Link
                href="/register"
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg transition font-semibold text-lg"
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="px-8 py-3 border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition font-semibold text-lg"
              >
                Sign In
              </Link>
            </div>
          )}
          {isLoggedIn && (
            <div className="flex gap-4 justify-center">
              <Link
                href="/lobby"
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg transition font-semibold text-lg"
              >
                Enter Lobby
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-3 border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition font-semibold text-lg"
              >
                View Dashboard
              </Link>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-white mb-2">Enterprise Security</h3>
            <p className="text-slate-300">
              Military-grade encryption, 2FA authentication, and real-time fraud detection
              to keep your account safe.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-xl font-bold text-white mb-2">Fair Play</h3>
            <p className="text-slate-300">
              Advanced anti-cheat engine with RTA detection, multi-account monitoring,
              and collusion analysis.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold text-white mb-2">Real-Time Gaming</h3>
            <p className="text-slate-300">
              WebSocket-powered real-time gameplay, instant bet updates, and live
              hand history tracking.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-white mb-2">Analytics</h3>
            <p className="text-slate-300">
              Comprehensive metrics dashboard with real-time performance monitoring
              and player statistics.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">⚖️</div>
            <h3 className="text-xl font-bold text-white mb-2">Compliance</h3>
            <p className="text-slate-300">
              Full KYC/AML verification, responsible gaming features, and regulatory
              compliance built-in.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-emerald-500 transition">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-xl font-bold text-white mb-2">Global Ready</h3>
            <p className="text-slate-300">
              Multi-currency support, international player base, and low-latency
              servers worldwide.
            </p>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
          <h3 className="text-2xl font-bold text-white mb-6">System Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-slate-300">Backend API</p>
              <p className="text-emerald-400 font-semibold">Healthy</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-slate-300">Database</p>
              <p className="text-emerald-400 font-semibold">Online</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-slate-300">Cache</p>
              <p className="text-emerald-400 font-semibold">Ready</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-slate-300">WebSocket</p>
              <p className="text-emerald-400 font-semibold">Connected</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-slate-300">Monitoring</p>
              <p className="text-emerald-400 font-semibold">Active</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 text-center text-slate-500 text-sm border-t border-slate-700 pt-8">
          <p>
            🎰 Multiplayer Poker Game • Phase 5 Complete • Built with Node.js + Next.js + Docker
          </p>
        </div>
      </main>
    </div>
  );
}
