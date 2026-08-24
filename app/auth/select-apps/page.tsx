'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import { SAMI_APPS, APP_CATEGORIES, getRecommendedAppKeys } from '@/lib/sami-apps';

export default function SelectAppsPage() {
  const router = useRouter();
  const [selectedApps, setSelectedApps] = useState<string[]>(getRecommendedAppKeys());
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const toggleApp = (appKey: string) => {
    setSelectedApps(prev => 
      prev.includes(appKey) ? prev.filter(k => k !== appKey) : [...prev, appKey]
    );
  };

  const filteredApps = activeCategory === 'all' 
    ? SAMI_APPS 
    : SAMI_APPS.filter(app => app.category === activeCategory);

  const handleContinue = () => {
    if (selectedApps.length === 0) return;
    sessionStorage.setItem('sami_selected_apps', JSON.stringify(selectedApps));
    router.push('/auth/select-plan');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">Select your apps</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Choose the apps your business needs</p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveCategory('all')} className={`px-4 py-2 rounded-full text-sm font-medium ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
            {APP_CATEGORIES.map((cat) => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-4 py-2 rounded-full text-sm font-medium ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
            ))}
          </div>
          <span className="text-sm text-gray-500">{selectedApps.length} selected</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => (
            <button key={app.key} onClick={() => toggleApp(app.key)} className={`p-5 rounded-2xl border-2 text-left transition ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">{app.name}</h3>
                {selectedApps.includes(app.key) && <Check size={18} className="text-blue-600" />}
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{app.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button onClick={handleContinue} disabled={selectedApps.length === 0} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2">
            Continue to Plan
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}