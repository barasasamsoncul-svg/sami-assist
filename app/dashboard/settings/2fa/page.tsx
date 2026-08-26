'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, ArrowLeft, Shield } from 'lucide-react';

export default function Setup2FAPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setup2FA();
  }, []);

  const setup2FA = async () => {
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQrCode(data.qrCodeDataUrl);
      setSecret(data.secret);
    } catch (err) {
      setError('Failed to setup 2FA');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      router.push('/dashboard/settings?tab=security');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Setup 2FA</h3>
            <p className="text-xs text-gray-500">Scan QR code with your authenticator app</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        {qrCode && (
          <div className="text-center mb-6">
            <img src={qrCode} alt="2FA QR Code" className="mx-auto w-48 h-48" />
            <p className="text-xs text-gray-500 mt-2">
              Or enter this code manually: <code className="font-mono">{secret}</code>
            </p>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Verification Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-2xl tracking-widest"
              placeholder="000000"
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? 'Verifying...' : 'Verify & Enable'}
            {!loading && <CheckCircle size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}