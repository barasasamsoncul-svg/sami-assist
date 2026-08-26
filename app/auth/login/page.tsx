'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Loader2, Shield, Mail, Lock, ArrowRight, ArrowLeft, Smartphone } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [userId, setUserId] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'authenticator' | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    if (searchParams.get('registered') === 'true') {
      setSuccess('Registration successful! Please check your email to verify your account, then sign in.');
    }
    if (searchParams.get('verified') === 'true') {
      setSuccess('Email verified! You can now sign in.');
    }
    if (searchParams.get('invited') === 'true') {
      setSuccess('Invite accepted! Please sign in to access the workspace.');
    }
  }, [searchParams]);

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
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.requires2FA) {
        setShow2FA(true);
        setUserId(data.userId);
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    setSendingCode(true);
    setError('');
    try {
      const response = await fetch('/api/auth/2fa/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send code');
      setTwoFactorMethod('email');
      setSuccess('Code sent to your email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSendingCode(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = twoFactorMethod === 'email' 
      ? '/api/auth/2fa/login-verify' 
      : '/api/auth/2fa/verify-authenticator';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: twoFactorCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShow2FA(false);
    setTwoFactorMethod(null);
    setTwoFactorCode('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition"
      >
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center">
          <Link href="/">
            <SaMiLogo size="xl" />
          </Link>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            AI-powered business workspace
          </p>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
            {show2FA ? 'Two-Factor Authentication' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {show2FA ? 'Verify your identity to continue' : 'Sign in to your workspace'}
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 py-8 px-6 shadow-xl shadow-gray-200/50 dark:shadow-black/20 rounded-2xl border border-gray-200 dark:border-gray-800 sm:px-10">
          {show2FA && !twoFactorMethod ? (
            /* CHOOSE 2FA METHOD */
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                Choose how you want to verify:
              </p>

              <button
                onClick={handleSendEmailCode}
                disabled={sendingCode}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 transition disabled:opacity-50"
              >
                <Mail size={22} className="text-blue-600 shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {sendingCode ? 'Sending code...' : 'Email me a code'}
                  </p>
                  <p className="text-xs text-gray-500">Send 6-digit code to your email</p>
                </div>
              </button>

              <button
                onClick={() => setTwoFactorMethod('authenticator')}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 transition"
              >
                <Smartphone size={22} className="text-green-600 shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">Use authenticator app</p>
                  <p className="text-xs text-gray-500">Enter code from Google Authenticator</p>
                </div>
              </button>

              <button
                onClick={handleBackToLogin}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition mt-2"
              >
                Back to login
              </button>
            </div>
          ) : show2FA && twoFactorMethod ? (
            /* ENTER 2FA CODE */
            <form onSubmit={handle2FAVerify} className="space-y-5">
              <div className="flex justify-center">
                <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
                  {twoFactorMethod === 'email' ? (
                    <Mail size={28} className="text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Shield size={28} className="text-green-600 dark:text-green-400" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 text-center">
                  {twoFactorMethod === 'email' ? 'Enter code from email' : 'Enter code from authenticator'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="mt-1.5 block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-3xl tracking-[0.5em] text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                  placeholder="000000"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || twoFactorCode.length !== 6}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Verify & Login
                    <ArrowRight size={16} />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTwoFactorMethod(null);
                  setTwoFactorCode('');
                }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
              >
                Choose different method
              </button>
            </form>
          ) : (
            /* REGULAR LOGIN */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email Address
                </label>
                <div className="mt-1.5 relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    id="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="mt-1.5 relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    id="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                    placeholder="Your password"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-blue-600 dark:text-blue-500 hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign In
                    <ArrowRight size={16} />
                  </span>
                )}
              </button>
            </form>
          )}

          {!show2FA && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <Link href="/auth/register" className="text-blue-600 dark:text-blue-500 hover:underline font-medium">
                  Start free
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <SaMiLogo size="xl" />
          <div className="mt-6 animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}