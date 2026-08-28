'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Loader2, Mail, Lock, ArrowRight, Smartphone, Shield } from 'lucide-react';
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

  const [loginMode, setLoginMode] = useState<'password' | 'authenticator'>('password');
  const [show2FA, setShow2FA] = useState(false);
  const [userId, setUserId] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');

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

    if (searchParams.get('registered') === 'true') setSuccess('Registration successful! Check your email.');
    if (searchParams.get('verified') === 'true') setSuccess('Email verified! You can log in.');
    if (searchParams.get('invited') === 'true') setSuccess('Invite accepted! Please log in.');
    if (searchParams.get('reset') === 'true') setSuccess('Password reset! Log in with new password.');
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

  const handlePasswordLogin = async (e: React.FormEvent) => {
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

      if (!response.ok) throw new Error(data.error);

      if (data.requires2FA) {
        setShow2FA(true);
        setUserId(data.userId);
        setSuccess('2FA required. Enter code or use authenticator.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailResponse = await fetch('/api/auth/2fa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: twoFactorCode }),
      });

      if (emailResponse.ok) {
        router.push('/dashboard');
        return;
      }

      const authResponse = await fetch('/api/auth/2fa/verify-authenticator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: twoFactorCode }),
      });

      const authData = await authResponse.json();
      if (!authResponse.ok) throw new Error(authData.error);

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setLoading(false);
    }
  };

  const handleAuthenticatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/authenticator-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, code: authCode }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/2fa/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccess('Code sent to your email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col justify-center py-12 px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center">
          <Link href="/"><SaMiLogo size="xl" /></Link>
          <p className="mt-2 text-sm text-gray-500">AI-powered business workspace</p>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
            {show2FA ? 'Two-Factor Authentication' : 'Welcome back'}
          </h2>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {success && <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm">{success}</div>}
        {error && <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>}

        <div className="bg-white dark:bg-gray-900 py-8 px-6 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-800 sm:px-10">
          {show2FA ? (
            <form onSubmit={handle2FAVerify} className="space-y-5">
              <div className="flex justify-center">
                <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
                  <Shield size={28} className="text-blue-600" />
                </div>
              </div>
              <input type="text" maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-3xl tracking-[0.5em]" placeholder="000000" autoFocus />
              <button onClick={handleSendEmailCode} type="button" className="w-full text-center text-sm text-blue-600 hover:underline">Send code to email</button>
              <button type="submit" disabled={loading || twoFactorCode.length !== 6} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
            </form>
          ) : loginMode === 'password' ? (
            <>
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium">Email Address</label>
                  <div className="mt-1.5 relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm" placeholder="john@company.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Password</label>
                  <div className="mt-1.5 relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm" placeholder="Your password" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Link href="/auth/forgot-password" className="text-xs text-blue-600 hover:underline">Forgot password?</Link>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Signing in...' : 'Sign In'}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">OR</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button onClick={() => { setLoginMode('authenticator'); setError(''); }} className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-medium hover:border-blue-500">
                <Smartphone size={18} />
                Use Authenticator Instead
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleAuthenticatorLogin} className="space-y-5">
                <div className="text-center">
                  <div className="h-14 w-14 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto">
                    <Smartphone size={28} className="text-green-600" />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Login with authenticator app</p>
                </div>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="Email" />
                <input type="text" required maxLength={6} value={authCode} onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ''))} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-3xl tracking-[0.5em]" placeholder="000000" autoFocus />
                <button type="submit" disabled={loading || authCode.length !== 6} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50">
                  {loading ? 'Logging in...' : 'Login with Authenticator'}
                </button>
              </form>
              <button onClick={() => { setLoginMode('password'); setError(''); }} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">
                Back to password login
              </button>
            </>
          )}
        </div>

        {!show2FA && (
          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account? <Link href="/auth/register" className="text-blue-600 hover:underline font-medium">Start free</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}