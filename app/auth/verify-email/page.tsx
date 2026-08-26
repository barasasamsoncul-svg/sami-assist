'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('failed');
        setMessage('No verification token found');
        return;
      }

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage('Email verified successfully! You can now log in.');
          setTimeout(() => {
            router.push('/auth/login?verified=true');
          }, 2000);
        } else {
          setStatus('failed');
          setMessage(data.error || 'Verification failed');
        }
      } catch (err) {
        setStatus('failed');
        setMessage('Verification failed. Please try again.');
      }
    };

    verifyEmail();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Link href="/" className="inline-block mb-8">
          <SaMiLogo size="lg" />
        </Link>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-800 max-w-sm mx-auto">
          {status === 'verifying' && (
            <>
              <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Verifying email...</h2>
              <p className="mt-1 text-sm text-gray-500">Please wait</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Email Verified!</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <p className="mt-2 text-sm text-gray-400">Redirecting to login...</p>
            </>
          )}

          {status === 'failed' && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Verification Failed</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <button
                onClick={() => router.push('/auth/register')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Back to Registration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}