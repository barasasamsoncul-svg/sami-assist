'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Eye, EyeOff, Loader2, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';

const STORAGE_KEY = 'sami_account_form';

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessName: string;
  password: string;
};

type OverlayState = {
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function passwordError(value: string) {
  if (value.length < 8) return 'Password must contain at least 8 characters.';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(value)) return 'Password must include at least one number.';
  return null;
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>({ firstName: '', lastName: '', email: '', phone: '', businessName: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  useEffect(() => {
    const code = searchParams.get('google_error') || searchParams.get('error');
    if (!code) return;

    const messages: Record<string, [string, string]> = {
      cancelled: ['Google sign-up cancelled', 'Google sign-up was cancelled. You can try again or continue with email.'],
      access_denied: ['Google sign-up cancelled', 'Google sign-up was cancelled. You can try again or continue with email.'],
      google_config: ['Google sign-up unavailable', 'Google sign-up is not configured correctly on the server.'],
      google_unverified: ['Google email is not verified', 'Your Google email must be verified before creating a SaMi account.'],
      google_account_deleted: ['Account unavailable', 'A previously deleted SaMi account is associated with this Google email.'],
    };

    const [title, message] = messages[code] || ['Google sign-up failed', 'We could not complete registration with Google. Please try again or continue with email.'];
    setGoogleLoading(false);
    setOverlay({ type: 'error', title, message });

    const clean = new URL(window.location.href);
    clean.searchParams.delete('google_error');
    clean.searchParams.delete('error');
    window.history.replaceState({}, '', clean.pathname + clean.search);
  }, [searchParams]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.firstName.trim()) return 'Enter your first name.';
    if (!form.lastName.trim()) return 'Enter your last name.';
    if (!validEmail(form.email)) return 'Enter a valid email address.';
    const pw = passwordError(form.password);
    if (pw) return pw;
    if (!form.businessName.trim()) return 'Enter your business name.';
    return null;
  }

  async function handleNext() {
    if (checking || googleLoading) return;
    const error = validate();
    if (error) {
      setOverlay({ type: 'warning', title: 'Check your information', message: error });
      return;
    }

    setChecking(true);
    setOverlay(null);
    const email = form.email.trim().toLowerCase();

    try {
      const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) throw new Error(`Email check failed (${response.status})`);
      const data = (await response.json()) as { exists?: boolean };

      if (data.exists) {
        setOverlay({
          type: 'warning',
          title: 'Account already exists',
          message: 'This email is already registered. Sign in instead.',
          primaryAction: { label: 'Sign in', href: `/login?email=${encodeURIComponent(email)}` },
        });
        return;
      }

      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email,
          phone: form.phone.trim(),
          businessName: form.businessName.trim(),
          password: form.password,
          authProvider: 'email',
          googleAuth: false,
        })
      );

      router.push('/select-apps');
    } catch (error) {
      setOverlay({
        type: 'error',
        title: 'Could not continue',
        message: error instanceof Error ? error.message : 'We could not verify your email right now. Please try again.',
      });
    } finally {
      setChecking(false);
    }
  }

  function handleGoogle() {
    if (checking || googleLoading) return;
    setGoogleLoading(true);
    setOverlay(null);
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
        title="Create your account"
        description="Create your SaMi workspace and choose the business apps you want to start with."
        footer={
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-blue-600 dark:text-blue-400">Sign in</Link>
          </>
        }
      >
        <button type="button" onClick={handleGoogle} disabled={checking || googleLoading} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
          {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-black">G</span>}
          {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={User} label="First name" value={form.firstName} onChange={(value) => update('firstName', value)} autoComplete="given-name" />
          <Field icon={User} label="Last name" value={form.lastName} onChange={(value) => update('lastName', value)} autoComplete="family-name" />
          <Field icon={Mail} label="Email address" type="email" value={form.email} onChange={(value) => update('email', value)} autoComplete="email" className="sm:col-span-2" />
          <Field icon={Phone} label="Phone (optional)" type="tel" value={form.phone} onChange={(value) => update('phone', value)} autoComplete="tel" />
          <Field icon={Building2} label="Business name" value={form.businessName} onChange={(value) => update('businessName', value)} autoComplete="organization" />

          <div className="sm:col-span-2">
            <label htmlFor="register-password" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Password</label>
            <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
              <ShieldCheck className="h-5 w-5 text-slate-400" />
              <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Use 8+ characters with uppercase, lowercase and a number.</p>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-4 border-t border-slate-100 pt-6 dark:border-slate-800">
          <p className="hidden max-w-sm text-xs leading-5 text-slate-400 sm:block">
            By continuing, you agree to SaMi&apos;s terms and privacy policy.
          </p>
          <button type="button" onClick={handleNext} disabled={checking || googleLoading} className="ml-auto flex h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {checking ? 'Checking...' : 'Next'}
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-5 text-xs">
          <Link href="/help" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Help</Link>
          <Link href="/terms" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Terms</Link>
          <Link href="/privacy" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Privacy</Link>
        </div>
      </AuthShell>
    </>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  className = '',
}: {
  icon: typeof User;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
        <Icon className="h-5 w-5 text-slate-400" />
        <input type={type} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
    </div>
  );
}

export default function RegisterClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#080B12]" />}>
      <RegisterContent />
    </Suspense>
  );
}
