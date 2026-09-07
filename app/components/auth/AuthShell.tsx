'use client';

import Link from 'next/link';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import SaMiLogo from '@/app/components/SaMiLogo';

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  footer?: ReactNode;
};

const THEME_KEY = 'sami_theme';

export default function AuthShell({
  title,
  description,
  children,
  backHref,
  backLabel = 'Back',
  footer,
}: AuthShellProps) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const dark = saved ? saved === 'dark' : systemDark;
    setDarkMode(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 transition-colors dark:bg-[#080B12] dark:text-white sm:px-6">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[0.88fr_1.12fr]">
          <div className="relative hidden min-h-[640px] overflow-hidden bg-[#030918] p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_28%,rgba(14,165,233,0.18),transparent_36%),radial-gradient(circle_at_75%_65%,rgba(124,58,237,0.16),transparent_34%)]" />

            <div className="relative z-10">
              <SaMiLogo size="xl" />
            </div>

            <div className="relative z-10 max-w-sm">
              <p className="text-3xl font-black tracking-tight text-white">
                One secure workspace for your business.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Access your SaMi account, workspace, installed apps and AI from one place.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-9 lg:p-11">
            <div className="lg:hidden">
              <SaMiLogo size="md" />
            </div>

            {backHref && (
              <Link
                href={backHref}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white lg:mt-0"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            )}

            <div className={backHref ? 'mt-7' : 'mt-7 lg:mt-0'}>
              <h1 className="text-3xl font-black tracking-tight">{title}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {description}
              </p>
            </div>

            <div className="mt-8">{children}</div>

            {footer && (
              <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {footer}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
