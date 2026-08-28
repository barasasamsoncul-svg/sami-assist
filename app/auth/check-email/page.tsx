'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { Mail, Sun, Moon } from 'lucide-react';

export default function CheckEmailPage() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('sami_theme') === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>
      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8"><SaMiLogo size="lg" /></Link>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
          <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto">
            <Mail size={32} className="text-blue-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Check your email</h2>
          <p className="mt-2 text-sm text-gray-500">We sent a verification link to your email.</p>
          <Link href="/auth/login" className="mt-6 inline-block w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}