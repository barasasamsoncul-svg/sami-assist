'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Loader2, Mail, Lock, ArrowRight, Smartphone, Shield, AlertTriangle, X, CheckCircle } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [loginMode, setLoginMode] = useState<'password' | 'authenticator'>('password');
  const [show2FA, setShow2FA] = useState(false);
  const [userId, setUserId] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');

  // Overlay state
  const [overlay, setOverlay] = useState<null | {
    type: 'error' | 'success' | 'warning';
    title: string;
    message: string;
    action?: 'resend' | 'login' | 'none';
  }>(null);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

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

    if (searchParams.get('verified') === 'true') {
      setOverlay({ type: 'success', title: 'Email Verified!', message: 'Your email has been verified. You can now log in.', action: 'none' });
    }
    if (searchParams.get('invited') === 'true') {
      setOverlay({ type: 'success', title: 'Invite Accepted!', message: 'You have joined the workspace. Please log in.', action: 'none' });
    }
    if (searchParams.get('reset') === 'true') {
      setOverlay({ type: 'success', title: 'Password Reset!', message: 'Your password has been reset. Log in with your new password.', action: 'none' });
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

  const closeOverlay = () => setOverlay(null);

  const handleResendFromOverlay = async () => {
    setResending(true);
    setResendMessage('');
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.success) {
        setResendMessage('Email sent. Check your inbox.');
      } else if (data.message) {
        setResendMessage(data.message);
      } else {
        setResendMessage(data.error || 'Failed to resend');
      }
    } catch {
      setResendMessage('Failed to resend');
    } finally {
      setResending(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.error && data.error.includes('verify your email')) {
          setOverlay({ type: 'warning', title: 'Email Not Verified', message: 'You need to verify your email before logging in.', action: 'resend' });
          setLoading(false);
          return;
        }
        setOverlay({ type: 'error', title: 'Login Failed', message: data.error || 'Invalid credentials', action: 'none' });
        setLoading(false);
        return;
      }

      if (data.requires2FA) {
        setShow2FA(true);
        setUserId(data.userId);
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch {
      setOverlay({ type: 'error', title: 'Login Failed', message: 'Something went wrong. Please try again.', action: 'none' });
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (!authResponse.ok) {
        setOverlay({ type: 'error', title: 'Invalid Code', message: authData.error || 'Invalid verification code', action: 'none' });
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch {
      setOverlay({ type: 'error', title: 'Verification Failed', message: 'Something went wrong', action: 'none' });
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
      setOverlay({ type: 'success', title: 'Code Sent', message: '2FA code sent to your email.', action: 'none' });
    } catch (err) {
      setOverlay({ type: 'error', title: 'Failed', message: err instanceof Error ? err.message : 'Failed to send code', action: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/authenticator-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, code: authCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        setOverlay({ type: 'error', title: 'Login Failed', message: data.error || 'Invalid credentials', action: 'none' });
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch {
      setOverlay({ type: 'error', title: 'Login Failed', message: 'Something went wrong', action: 'none' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center">
          <Link href="/"><SaMiLogo size="xl" /></Link>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">AI-powered business workspace</p>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
            {show2FA ? 'Two-Factor Authentication' : 'Welcome back'}
          </h2>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
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
              <button type="button" onClick={() => { setShow2FA(false); setTwoFactorCode(''); }} className="w-full text-center text-sm text-gray-500">Back</button>
            </form>
          ) : loginMode === 'password' ? (
            <>
              <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                  <div className="mt-1.5 relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm" placeholder="john@company.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
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
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                <span className="text-xs text-gray-400">OR</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              <button onClick={() => setLoginMode('authenticator')} className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-medium hover:border-blue-500">
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
                </div>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="Email" />
                <input type="text" required maxLength={6} value={authCode} onChange={(e) => setAuthCode(e.target.value.replace(/[^0-9]/g, ''))} className="block w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-3xl tracking-[0.5em]" placeholder="000000" autoFocus />
                <button type="submit" disabled={loading || authCode.length !== 6} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50">
                  {loading ? 'Logging in...' : 'Login with Authenticator'}
                </button>
              </form>
              <button onClick={() => setLoginMode('password')} className="mt-4 w-full text-center text-sm text-gray-500">Back to password login</button>
            </>
          )}
        </div>

        {!show2FA && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Don't have an account? <Link href="/auth/register" className="text-blue-600 hover:underline font-medium">Start free</Link>
          </p>
        )}
      </div>

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={closeOverlay} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>

            {overlay.type === 'success' && (
              <div className="h-14 w-14 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-600" />
              </div>
            )}
            {overlay.type === 'error' && (
              <div className="h-14 w-14 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
            )}
            {overlay.type === 'warning' && (
              <div className="h-14 w-14 bg-yellow-100 dark:bg-yellow-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle size={28} className="text-yellow-600" />
              </div>
            )}

            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>

            {overlay.action === 'resend' && (
              <>
                {resendMessage && <p className="mt-3 text-sm text-green-600">{resendMessage}</p>}
                <button
                  onClick={handleResendFromOverlay}
                  disabled={resending}
                  className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  {resending ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </>
            )}

            {overlay.action !== 'resend' && (
              <button
                onClick={closeOverlay}
                className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}