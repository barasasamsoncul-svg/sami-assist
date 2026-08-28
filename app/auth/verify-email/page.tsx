'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'already_used' | 'expired' | 'invalid' | 'failed'>('verifying');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('invalid');
      return;
    }

    const verify = async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();

        if (data.success) {
          setStatus('success');
        } else if (data.error === 'already_used') {
          setStatus('already_used');
        } else if (data.error === 'expired') {
          setStatus('expired');
          // Extract email from token if possible - we'll ask user
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('failed');
      }
    };

    verify();
  }, [searchParams]);

  const handleResend = async () => {
    if (!email) {
      setResendMessage('Enter your email to resend verification.');
      return;
    }

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
        setResendMessage('Verification email sent. Check your inbox.');
      } else {
        setResendMessage(data.error || 'Failed to resend');
      }
    } catch {
      setResendMessage('Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md w-full">
        <Link href="/" className="inline-block mb-8"><SaMiLogo size="lg" /></Link>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-800">
          {status === 'verifying' && (
            <>
              <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />
              <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Verifying...</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Email Verified!</h2>
              <p className="mt-2 text-sm text-gray-500">Your account is active.</p>
              <button
                onClick={() => router.push('/auth/login?verified=true')}
                className="mt-6 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
              >
                Continue to Login
              </button>
            </>
          )}

          {status === 'already_used' && (
            <>
              <AlertTriangle size={48} className="mx-auto text-yellow-500" />
              <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Already Verified</h2>
              <p className="mt-2 text-sm text-gray-500">Your email is already verified. Please login.</p>
              <Link href="/auth/login" className="mt-6 inline-block w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition">
                Go to Login
              </Link>
            </>
          )}

          {(status === 'expired' || status === 'invalid' || status === 'failed') && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
                {status === 'expired' ? 'Link Expired' : 'Invalid Link'}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {status === 'expired' ? 'Your verification link expired.' : 'This link is invalid.'}
              </p>
              
              <div className="mt-4 space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleResend}
                  disabled={resending || !email}
                  className="w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  {resending ? 'Sending...' : 'Resend Verification Email'}
                </button>
                {resendMessage && <p className="text-sm text-gray-500">{resendMessage}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}