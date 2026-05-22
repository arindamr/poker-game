'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiClient } from '@/lib/api';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  balance: number;
  joinedAt: string;
  totalGames: number;
  winRate: number;
  totalWinnings: number;
  profileImage?: string;
}

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProfile();
  }, [router]);

  const loadProfile = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('Not logged in');
      }
      const client = new ApiClient();
      const response = await client.get(`/api/v1/users/${userId}`);
      const user = response.user || response.data;
      if (!user) {
        throw new Error('Profile data missing from response');
      }
      // Map the backend user record onto the profile shape. Game stats are not
      // tracked yet, so they default to 0 (see TODO F1).
      const mapped: UserProfile = {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: Number(user.account_balance ?? 0),
        joinedAt: user.created_at,
        totalGames: 0,
        winRate: 0,
        totalWinnings: 0,
      };
      setProfile(mapped);
      setFormData({
        username: mapped.username,
        email: mapped.email,
      });
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('Not logged in');
      }
      const client = new ApiClient();
      await client.put(`/api/v1/users/${userId}`, formData);
      setIsEditing(false);
      loadProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-white">♠️</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Poker Game</h1>
          </Link>
          <div className="flex gap-4">
            <Link
              href="/lobby"
              className="px-6 py-2 text-white hover:text-emerald-400 transition font-medium"
            >
              Lobby
            </Link>
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
      <main className="max-w-4xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-6 p-4 bg-red-900 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        {profile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Profile Card */}
            <div className="md:col-span-1">
              <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-4xl">👤</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{profile.username}</h2>
                <p className="text-slate-400 mb-4">{profile.email}</p>
                <div className="mb-6 pt-6 border-t border-slate-700">
                  <p className="text-slate-400 text-sm mb-2">Account Balance</p>
                  <p className="text-3xl font-bold text-emerald-400">${profile.balance.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
                >
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="md:col-span-2 space-y-6">
              {/* Edit Form */}
              {isEditing && (
                <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
                  <h3 className="text-xl font-bold text-white mb-6">Edit Profile</h3>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Username
                      </label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) =>
                          setFormData({ ...formData, username: e.target.value })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium"
                    >
                      Save Changes
                    </button>
                  </form>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <p className="text-slate-400 text-sm mb-2">Total Games</p>
                  <p className="text-3xl font-bold text-emerald-400">{profile.totalGames}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <p className="text-slate-400 text-sm mb-2">Win Rate</p>
                  <p className="text-3xl font-bold text-emerald-400">{(profile.winRate * 100).toFixed(1)}%</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 md:col-span-2">
                  <p className="text-slate-400 text-sm mb-2">Total Winnings</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    ${profile.totalWinnings.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Account Info */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-4">Account Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-slate-700">
                    <span className="text-slate-400">Account ID</span>
                    <span className="text-white font-medium">#{profile.id}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-700">
                    <span className="text-slate-400">Member Since</span>
                    <span className="text-white font-medium">
                      {new Date(profile.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Status</span>
                    <span className="text-emerald-400 font-medium">Active</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/lobby"
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-medium text-center"
                >
                  Browse Tables
                </Link>
                <button className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium">
                  Change Password
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
