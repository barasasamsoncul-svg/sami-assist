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
    router.push('/auth/terms');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-12 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-10">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-2xl w-full">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Select your apps</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Step 2 of 4: Choose apps</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === 2 ? 'bg-blue-600 text-white' : step < 2 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}>
                {step < 2 ? <Check size={14} /> : step}
              </div>
              {step < 4 && <div className={`w-6 h-0.5 ${step < 2 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{selectedApps.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
            {APP_CATEGORIES.map((cat) => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2">
            {filteredApps.map((app) => (
              <button key={app.key} onClick={() => toggleApp(app.key)} className={`p-3 rounded-xl border-2 text-left transition ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</span>
                  {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600" />}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={() => router.back()} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-1">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={handleNext} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1">
              Next: Terms <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>
            <div className="h-14 w-14 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <h3 className="mt-4 text-xl font-bold">{overlay.title}</h3>
            <p className="mt-2 text-sm text-gray-500">{overlay.message}</p>
            <button onClick={() => setOverlay(null)} className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}