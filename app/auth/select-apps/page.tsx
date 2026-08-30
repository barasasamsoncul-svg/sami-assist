'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, ArrowLeft, Check, X, AlertTriangle } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import { SAMI_APPS, APP_CATEGORIES } from '@/lib/sami-apps';

export default function SelectAppsPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [overlay, setOverlay] = useState<null | { type: 'error'; title: string; message: string }>(null);

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
  }, []);

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

  const toggleApp = (appKey: string) => {
    setSelectedApps(prev => prev.includes(appKey) ? prev.filter(k => k !== appKey) : [...prev, appKey]);
  };

  const filteredApps = activeCategory === 'all' ? SAMI_APPS : SAMI_APPS.filter(app => app.category === activeCategory);

  const handleNext = () => {
    if (selectedApps.length === 0) {
      setOverlay({ type: 'error', title: 'No Apps Selected', message: 'Select at least one app to continue.' });
      return;
    }
    sessionStorage.setItem('sami_selected_apps', JSON.stringify(selectedApps));
    router.push('/auth/select-plan');
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
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Select your apps</h1>
              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">Step 2 of 3: Choose the apps your business needs.</p>
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-5">
              <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
              {APP_CATEGORIES.map((cat) => (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
              ))}
            </div>

            {/* Apps Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-2 mb-5">
              {filteredApps.map((app) => (
                <button
                  key={app.key}
                  onClick={() => toggleApp(app.key)}
                  className={`p-3 rounded-xl border-2 text-left transition ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</span>
                    {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{app.description}</p>
                </button>
              ))}
            </div>

            {/* Bottom action */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-5">
              <p className="hidden sm:block text-[11px] text-gray-400 dark:text-gray-500">
                {selectedApps.length} app{selectedApps.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-3 ml-auto">
                <button onClick={() => router.back()} className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                  <ArrowLeft size={15} /> Back
                </button>
                <button onClick={handleNext} className="h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-2 transition">
                  Next: Plan <ArrowRight size={15} />
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
            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">{overlay.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{overlay.message}</p>
            <button onClick={() => setOverlay(null)} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition">Continue</button>
          </div>
        </div>
      )}
    </main>
  );
}