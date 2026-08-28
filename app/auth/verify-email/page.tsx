'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token');
      if (!token) { setStatus('failed'); setMessage('No token'); return; }

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (data.success) {
          setStatus('success');
          setTimeout(() => router.push('/auth/login?verified=true'), 2000);
        } else {
          setStatus('failed');
          setMessage(data.error);
        }
      } catch {
        setStatus('failed');
        setMessage('Failed');
      }
    };
    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Link href="/" className="inline-block mb-8"><SaMiLogo size="lg" /></Link>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl max-w-sm mx-auto">
          {status === 'verifying' && <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />}
          {status === 'success' && <CheckCircle size={48} className="mx-auto text-green-500" />}
          {status === 'failed' && <XCircle size={48} className="mx-auto text-red-500" />}
          <h2 className="mt-4 text-lg font-semibold">
            {status === 'verifying' ? 'Verifying...' : status === 'success' ? 'Email Verified!' : 'Failed'}
          </h2>
          {message && <p className="mt-2 text-sm text-gray-500">{message}</p>}
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