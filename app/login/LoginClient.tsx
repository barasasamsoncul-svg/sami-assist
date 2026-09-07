'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type LoginResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
  email?: string;
  challengeToken?: string;
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  if (/^\/(login|register|forgot-password|reset-password|verify-email)/.test(value)) return '/dashboard';
  return value;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => safeNextPath(searchParams.get('next')), [searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const verified = searchParams.get('verified');
    const reason = searchParams.get('reason');

    if (emailParam) setEmail(emailParam);
    if (verified === '1') setOverlay(getAuthOverlayMessage('EMAIL_VERIFIED'));
    else if (reason === 'password_reset') setOverlay(getAuthOverlayMessage('PASSWORD_RESET_SUCCESS'));
    else if (reason === 'logged_out') setOverlay(getAuthOverlayMessage('LOGGED_OUT'));
    else if (reason === 'session_expired') setOverlay(getAuthOverlayMessage('SESSION_EXPIRED'));
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setOverlay(getAuthOverlayMessage('INVALID_EMAIL'));
      return;
    }
    if (!password) {
      setOverlay(getAuthOverlayMessage('PASSWORD_REQUIRED'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail, password, rememberMe }),
      });

      const data = (await response.json().catch(() => ({
        success: false,
        code: 'LOGIN_ERROR',
        error: 'Login failed. Please try again.',
      }))) as LoginResponse;

      if (data.code === 'TWO_FACTOR_REQUIRED' && data.challengeToken) {
        sessionStorage.setItem('sami_2fa_email', data.email || cleanEmail);
        sessionStorage.setItem('sami_2fa_challenge', data.challengeToken);
        sessionStorage.setItem('sami_2fa_remember', String(rememberMe));
        router.push(data.next || '/login/two-factor');
        return;
      }

      if (!response.ok || !data.success) {
        setOverlay(
          getAuthOverlayMessage(data.code, {
            fallback: data.error,
            retryAfterSeconds: data.retryAfterSeconds,
            lockedUntil: data.lockedUntil,
            email: cleanEmail,
          })
        );
        return;
      }

      router.replace(data.next || nextPath);
    } catch (error) {
      setOverlay(
        getAuthOverlayMessage('LOGIN_ERROR', {
          fallback: error instanceof Error ? error.message : 'Login failed. Please try again.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogle() {
    window.location.assign('/api/auth/google');
  }

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={overlay.primaryAction}
          secondaryAction={overlay.secondaryAction}
          onClose={() => setOverlay(null)}
        />
      )}

      <AuthShell
        title="Welcome back"
        description="Sign in to continue to your SaMi workspace."
        footer={
          <>
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-bold text-blue-600 dark:text-blue-400">
              Create account
            </Link>
          </>
        }
      >
        <button
          type="button"
          onClick={handleGoogle}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-black">G</span>
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Email address</label>
            <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
              <Mail className="h-5 w-5 text-slate-400" />
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Password</label>
              <Link href="/forgot-password" className="text-sm font-bold text-blue-600 dark:text-blue-400">Forgot password?</Link>
            </div>
            <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
              <LockKeyhole className="h-5 w-5 text-slate-400" />
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Enter your password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <span>
              <span className="block text-sm font-semibold">Remember this device</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Stay signed in for longer on this browser.</span>
            </span>
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-5 w-5 rounded" />
          </label>

          <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            Sign in
          </button>
        </form>
      </AuthShell>
    </>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#080B12]" />}>
      <LoginContent />
    </Suspense>
  );
}
