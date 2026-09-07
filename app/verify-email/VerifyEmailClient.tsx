'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type VerifyResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
};

function cleanCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifying) return;
    if (!email.trim()) {
      setOverlay(getAuthOverlayMessage('INVALID_EMAIL'));
      return;
    }
    if (cleanCode(code).length !== 6) {
      setOverlay({ type: 'warning', title: 'Enter the verification code', message: 'Enter the 6-digit code sent to your email address.' });
      return;
    }

    setVerifying(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: cleanCode(code) }),
      });
      const data = (await response.json().catch(() => ({}))) as VerifyResponse;

      if (!response.ok || !data.success) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error, email }));
        return;
      }

      setOverlay(getAuthOverlayMessage('EMAIL_VERIFIED'));
      setTimeout(() => router.replace(data.next || '/login?verified=1'), 900);
    } catch (error) {
      setOverlay(getAuthOverlayMessage('EMAIL_VERIFY_ERROR', { fallback: error instanceof Error ? error.message : 'Could not verify email.' }));
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (resending || !email.trim()) return;
    setResending(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await response.json().catch(() => ({}))) as VerifyResponse;
      if (!response.ok) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error }));
        return;
      }
      setOverlay(getAuthOverlayMessage('VERIFICATION_CODE_SENT'));
    } catch (error) {
      setOverlay(getAuthOverlayMessage('RESEND_VERIFICATION_ERROR', { fallback: error instanceof Error ? error.message : 'Could not resend verification code.' }));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {overlay && <SaMiOverlay open type={overlay.type} title={overlay.title} message={overlay.message} primaryAction={overlay.primaryAction} secondaryAction={overlay.secondaryAction} onClose={() => setOverlay(null)} />}

      <AuthShell
        title="Verify your email"
        description="Enter the 6-digit code sent to your email address."
        backHref="/login"
        backLabel="Back to login"
        footer={
          <>
            Need another code?{' '}
            <button type="button" onClick={resend} disabled={resending} className="font-bold text-blue-600 disabled:opacity-60 dark:text-blue-400">
              {resending ? 'Sending...' : 'Resend code'}
            </button>
          </>
        }
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <MailCheck className="h-7 w-7" />
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label htmlFor="verify-email" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Email address</label>
            <input id="verify-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950" />
          </div>

          <div>
            <label htmlFor="verify-code" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Verification code</label>
            <input id="verify-code" inputMode="numeric" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="000000" className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-[0.45em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950" />
          </div>

          <button type="submit" disabled={verifying} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Verify email
          </button>
        </form>
      </AuthShell>
    </>
  );
}
