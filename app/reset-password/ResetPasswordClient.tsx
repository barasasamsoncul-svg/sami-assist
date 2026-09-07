'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type ResponseData = { success?: boolean; code?: string; error?: string; message?: string; next?: string };

function validatePassword(password: string) {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'PASSWORD_WEAK';
  }
  return null;
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(
    token ? null : {
      type: 'warning',
      title: 'Invalid reset link',
      message: 'This password reset link is missing or invalid. Request a new one to continue.',
      primaryAction: { label: 'Request new link', href: '/forgot-password' },
    }
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    const passwordIssue = validatePassword(newPassword);
    if (passwordIssue) {
      setOverlay(getAuthOverlayMessage(passwordIssue));
      return;
    }
    if (newPassword !== confirmPassword) {
      setOverlay(getAuthOverlayMessage('PASSWORDS_DO_NOT_MATCH'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, email, newPassword, confirmPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as ResponseData;
      if (!response.ok || !data.success) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error }));
        return;
      }
      setOverlay(getAuthOverlayMessage('PASSWORD_RESET_SUCCESS'));
      setTimeout(() => router.replace(data.next || '/login?reason=password_reset'), 900);
    } catch (error) {
      setOverlay(getAuthOverlayMessage('RESET_PASSWORD_ERROR', { fallback: error instanceof Error ? error.message : 'Could not reset password.' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {overlay && <SaMiOverlay open type={overlay.type} title={overlay.title} message={overlay.message} primaryAction={overlay.primaryAction} secondaryAction={overlay.secondaryAction} onClose={() => setOverlay(null)} />}
      <AuthShell title="Create a new password" description="Choose a strong password for your SaMi account." backHref="/login" backLabel="Back to login">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <PasswordField label="New password" value={newPassword} onChange={setNewPassword} show={showPassword} toggle={() => setShowPassword((v) => !v)} />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} show={showPassword} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            Use at least 8 characters with uppercase, lowercase and a number.
          </div>
          <button type="submit" disabled={submitting || !token} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            Reset password
          </button>
        </form>
      </AuthShell>
    </>
  );
}

function PasswordField({ label, value, onChange, show, toggle }: { label: string; value: string; onChange: (value: string) => void; show: boolean; toggle?: () => void }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
        <LockKeyhole className="h-5 w-5 text-slate-400" />
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {toggle && (
          <button type="button" onClick={toggle} className="text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}
