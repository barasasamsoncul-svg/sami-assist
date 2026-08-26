'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Sun, Moon } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function CheckEmailPage() {
  const [darkMode, setDarkMode] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="text-center max-w-md">
        <Link href="/" className="inline-block mb-8">
          <SaMiLogo size="lg" />
        </Link>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-800">
          <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto">
            <Mail size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Check your email</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            We sent a verification link to your email address. Click the link to activate your account.
          </p>
          
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Didn't receive the email? Check your spam folder or{' '}
              <button className="text-blue-600 dark:text-blue-500 hover:underline font-medium">
                resend verification email
              </button>
            </p>
          </div>

          <Link
            href="/auth/login"
            className="mt-6 inline-block w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}