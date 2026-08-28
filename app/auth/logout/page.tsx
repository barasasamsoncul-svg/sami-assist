'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function LogoutPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'logging_out' | 'done' | 'error'>('logging_out');

  useEffect(() => {
    const handleLogout = async () => {
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw new Error('Failed');
        setStatus('done');
        setTimeout(() => router.push('/auth/login'), 2000);
      } catch {
        setStatus('error');
      }
    };
    handleLogout();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Link href="/" className="inline-block mb-8"><SaMiLogo size="xl" /></Link>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl max-w-sm mx-auto">
          {status === 'logging_out' && (
            <>
              <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />
              <h2 className="mt-4 text-lg font-semibold">Signing out...</h2>
            </>
          )}
          {status === 'done' && (
            <>
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-lg font-semibold">Signed out</h2>
              <Link href="/auth/login" className="mt-4 inline-block text-blue-600 hover:underline">Go to login</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-semibold">Failed</h2>
              <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">Back to dashboard</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}