'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sun, Moon, ArrowLeft, HelpCircle, Mail, BookOpen, Shield, CreditCard, Sparkles } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function HelpPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);

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

  const helpSections = [
    {
      icon: BookOpen,
      title: 'Getting Started',
      items: [
        'Create your SaMi account',
        'Verify your email address',
        'Select your apps',
        'Choose your plan',
      ],
    },
    {
      icon: Sparkles,
      title: 'SaMi AI',
      items: [
        'How to use AI assistant',
        'AI permissions explained',
        'AI usage limits',
        'AI conversation history',
      ],
    },
    {
      icon: CreditCard,
      title: 'Billing & Subscription',
      items: [
        'Free plan features',
        'Upgrading your plan',
        'Trial period information',
        'Payment methods',
      ],
    },
    {
      icon: Shield,
      title: 'Security',
      items: [
        'Two-factor authentication',
        'Session management',
        'Account recovery',
        'Password reset',
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            {/* Brand */}
            <div className="mb-7 flex items-center justify-between">
              <Link href="/" className="inline-flex flex-col items-start">
                <SaMiLogo size="lg" />
                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">AI-powered business workspace</span>
              </Link>
              <button onClick={() => router.back()} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                <ArrowLeft size={15} /> Back
              </button>
            </div>

            {/* Header */}
            <div className="mb-7">
              <div className="flex items-center gap-3 mb-2">
                <HelpCircle size={24} className="text-blue-600" />
                <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Help Center</h1>
              </div>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">Find answers to common questions about SaMi.</p>
            </div>

            {/* Help Sections */}
            <div className="grid sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-3">
              {helpSections.map((section) => {
                const Icon = section.icon;
                return (
                  <div key={section.title} className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={18} className="text-blue-600" />
                      <h3 className="font-semibold text-gray-900 dark:text-white text-[14px]">{section.title}</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {section.items.map((item) => (
                        <li key={item} className="text-[13px] text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <span className="text-blue-400 mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Contact */}
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                Can't find what you're looking for?
              </p>
              <a href="mailto:support@sami.tech" className="flex items-center gap-2 text-[13px] text-blue-600 hover:text-blue-700 font-medium">
                <Mail size={15} /> Contact Support
              </a>
            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>
    </main>
  );
}