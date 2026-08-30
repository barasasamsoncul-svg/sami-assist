'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, Building2, Phone, Loader2, X, AlertTriangle } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function GoogleCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overlay, setOverlay] = useState<null | { type: 'error'; title: string; message: string }>(null);

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    avatarUrl: '',
    phone: '',
    businessName: '',
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    setForm({
      email: searchParams.get('email') || '',
      firstName: searchParams.get('firstName') || '',
      lastName: searchParams.get('lastName') || '',
      avatarUrl: searchParams.get('avatar') || '',
      phone: '',
      businessName: '',
    });
  }, [searchParams]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const handleNext = () => {
    if (!form.businessName.trim()) {
      setOverlay({ type: 'error', title: 'Business Name Required', message: 'Please enter your business name.' });
      return;
    }

    // Save to sessionStorage
    sessionStorage.setItem('sami_account_form', JSON.stringify({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      businessName: form.businessName,
      avatarUrl: form.avatarUrl,
      googleAuth: true,
      emailVerified: true,
    }));

    router.push('/auth/select-apps');
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            {/* Brand */}
            <div className="mb-7">
              <Link href="/" className="inline-flex flex-col items-start">
                <SaMiLogo size="lg" />
                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">AI-powered business workspace</span>
              </Link>
            </div>

            {/* Header */}
            <div className="mb-7">
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Complete your workspace</h1>
              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">One more step. Enter your business name.</p>
            </div>

            {/* Google Account Info */}
            <div className="mb-7 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl flex items-center gap-4">
              {form.avatarUrl && <img src={form.avatarUrl} alt="Google avatar" className="h-10 w-10 rounded-full" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{form.firstName} {form.lastName}</p>
                <p className="text-xs text-gray-500 truncate">{form.email}</p>
              </div>
              <span className="text-xs text-green-600 font-medium">✓ Google</span>
            </div>

            {/* Form */}
            <div className="space-y-5">
              <div>
                <label className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">Business Name</label>
                <div className="relative">
                  <Building2 size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Acme Ltd" className="w-full h-[46px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">
                  Phone <span className="font-normal text-gray-400">optional</span>
                </label>
                <div className="relative">
                  <Phone size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 700 000 000" className="w-full h-[46px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
                <button onClick={handleNext} disabled={loading} className="min-w-[145px] h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60">
                  Next: Select Apps <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>

      {/* Overlay */}
      {overlay && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setOverlay(null)}>
          <div className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={17} /></button>
            <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center"><AlertTriangle size={25} className="text-red-600" /></div>
            <h2 className="mt-4 text-[19px] font-semibold">{overlay.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{overlay.message}</p>
            <button onClick={() => setOverlay(null)} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition">Continue</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function GoogleCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <GoogleCompleteContent />
    </Suspense>
  );
}