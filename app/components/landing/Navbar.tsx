'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY = 'sami_theme';

const NAV_LINKS = [
  {
    label: 'Home',
    href: '/',
  },
  {
    label: 'Features',
    href: '/#features',
  },
  {
    label: 'Pricing',
    href: '/#pricing',
  },
  {
    label: 'About',
    href: '/#about',
  },
] as const;

/* ============================================================
   NAVBAR
   ============================================================ */

export default function Navbar() {
  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [darkMode, setDarkMode] =
    useState(false);

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const prefersDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        stored === 'dark' ||
        (!stored && prefersDark);

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Navbar still works without
      // theme persistence.
    }
  }, []);

  const toggleTheme =
    useCallback(() => {
      setDarkMode(
        (current) => {
          const next = !current;

          document.documentElement.classList.toggle(
            'dark',
            next
          );

          try {
            localStorage.setItem(
              THEME_STORAGE_KEY,
              next
                ? 'dark'
                : 'light'
            );
          } catch {
            // Ignore storage failure.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     MOBILE
     ========================================================== */

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleEscape
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleEscape
      );
    };
  }, [mobileOpen]);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl transition-colors dark:border-slate-800/80 dark:bg-[#080b12]/85">

        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-[76px] w-full max-w-[1500px] items-center gap-5 px-4 sm:px-6 lg:px-8"
        >
          {/* ==================================================
              BRAND
             ================================================== */}

          <Link
            href="/"
            aria-label="SaMi home"
            onClick={closeMobileMenu}
            className="flex min-w-0 shrink-0 items-center"
          >
            {/* FULL APPROVED SAMI LOGO */}
            <SaMiLogo
              size="md"
              className="max-w-full"
            />
          </Link>

          {/* ==================================================
              DESKTOP NAVIGATION
             ================================================== */}

          <div className="ml-auto hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  {item.label}
                </Link>
              )
            )}
          </div>

          {/* ==================================================
              DESKTOP ACTIONS
             ================================================== */}

          <div className="ml-auto hidden items-center gap-2 lg:flex">

            {/* Theme */}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                darkMode
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {darkMode ? (
                <Sun className="h-[17px] w-[17px]" />
              ) : (
                <Moon className="h-[17px] w-[17px]" />
              )}
            </button>

            {/* Sign in */}

            <Link
              href="/login"
              className="flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-black text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Sign in
            </Link>

            {/* Register */}

            <Link
              href="/register"
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[13px] font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.99]"
            >
              Start free

              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* ==================================================
              MOBILE ACTIONS
             ================================================== */}

          <div className="ml-auto flex items-center gap-2 lg:hidden">

            {/* Sign in stays immediately accessible */}

            <Link
              href="/login"
              className="hidden h-9 items-center justify-center rounded-lg px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 sm:flex"
            >
              Sign in
            </Link>

            {/* Theme */}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                darkMode
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {/* Menu */}

            <button
              type="button"
              onClick={() =>
                setMobileOpen(
                  (current) =>
                    !current
                )
              }
              aria-expanded={mobileOpen}
              aria-controls="sami-mobile-navigation"
              aria-label={
                mobileOpen
                  ? 'Close navigation'
                  : 'Open navigation'
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {mobileOpen ? (
                <X className="h-[18px] w-[18px]" />
              ) : (
                <Menu className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </nav>

        {/* ====================================================
            MOBILE NAVIGATION
           ==================================================== */}

        {mobileOpen && (
          <div
            id="sami-mobile-navigation"
            className="border-t border-slate-200 bg-white px-4 pb-5 pt-4 shadow-xl lg:hidden dark:border-slate-800 dark:bg-[#0c1018]"
          >
            <div className="mx-auto max-w-[1500px]">

              {/* Navigation */}

              <div className="grid gap-1">
                {NAV_LINKS.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={
                        closeMobileMenu
                      }
                      className="flex h-11 items-center justify-between rounded-xl px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {item.label}

                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  )
                )}
              </div>

              {/* Mobile actions */}

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">

                <Link
                  href="/login"
                  onClick={
                    closeMobileMenu
                  }
                  className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Sign in
                </Link>

                <Link
                  href="/register"
                  onClick={
                    closeMobileMenu
                  }
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
                >
                  Start free

                  <ArrowIcon />
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ======================================================
          MOBILE BACKDROP
         ====================================================== */}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={
            closeMobileMenu
          }
          className="fixed inset-0 top-[76px] z-40 bg-slate-950/20 backdrop-blur-[2px] lg:hidden dark:bg-black/40"
        />
      )}
    </>
  );
}

/* ============================================================
   SMALL ARROW
   ============================================================ */

function ArrowIcon() {
  return (
    <ChevronRight className="h-4 w-4" />
  );
}