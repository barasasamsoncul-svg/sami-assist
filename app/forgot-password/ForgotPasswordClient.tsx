'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, Loader2, Mail, ShieldCheck } from 'lucide-react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type ResponseData = { success?: boolean; code?: string; message?: string; error?: string };

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setOverlay(getAuthOverlayMessage('INVALID_EMAIL'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = (await response.json().catch(() => ({}))) as ResponseData;
      if (!response.ok) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error }));
        return;
      }
      setOverlay(getAuthOverlayMessage('RESET_LINK_SENT'));
    } catch (error) {
      setOverlay(getAuthOverlayMessage('FORGOT_PASSWORD_ERROR', { fallback: error instanceof Error ? error.message : 'Could not send reset link.' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {overlay && <SaMiOverlay open type={overlay.type} title={overlay.title} message={overlay.message} primaryAction={overlay.primaryAction} secondaryAction={overlay.secondaryAction} onClose={() => setOverlay(null)} />}
      <AuthShell
        title="Reset your password"
        description="Enter your SaMi account email. If the account exists, we will send a secure password reset link."
        backHref="/login"
        backLabel="Back to login"
        footer={<>Remember your password? <Link href="/login" className="font-bold text-blue-600 dark:text-blue-400">Sign in</Link></>}
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="forgot-email" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Email address</label>
            <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
              <Mail className="h-5 w-5 text-slate-400" />
              <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="you@example.com" />
            </div>
          </div>

          <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            Send reset link
          </button>
        </form>
      </AuthShell>
    </>
  );
}
