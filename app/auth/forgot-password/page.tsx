'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { Mail, ArrowLeft, CheckCircle, Sun, Moon, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('sami_theme') === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold">Forgot Password</h2>
        </div>
        {error && <div className="mb-4 p-4 bg-red-50 rounded-xl text-red-700 text-sm">{error}</div>}
        {sent ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl text-center">
            <CheckCircle size={48} className="mx-auto text-green-500" />
            <h3 className="mt-4 text-lg font-bold">Check your email</h3>
            <p className="mt-2 text-sm text-gray-500">Reset link sent to {email}</p>
            <Link href="/auth/login" className="mt-6 inline-block w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold">Back to Login</Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="Email" />
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            <Link href="/auth/login" className="mt-4 flex items-center justify-center gap-1 text-sm text-gray-500">
              <ArrowLeft size={14} /> Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}