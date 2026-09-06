
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  Moon,
  ArrowRight,
  Building2,
  Phone,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

interface AccountForm {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  phone: string;
  businessName: string;
}

interface OverlayState {
  title: string;
  message: string;
}

function GoogleCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  const [form, setForm] = useState<AccountForm>({
    email: '',
    firstName: '',
    lastName: '',
    avatarUrl: '',
    phone: '',
    businessName: '',
  });

  /*
   * ------------------------------------------------------------
   * Theme
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    const useDark =
      savedTheme === 'dark' ||
      (!savedTheme && prefersDark);

    setDarkMode(useDark);

    document.documentElement.classList.toggle(
      'dark',
      useDark
    );
  }, []);

  /*
   * ------------------------------------------------------------
   * Read Google account information
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const email = searchParams.get('email') || '';
    const firstName = searchParams.get('firstName') || '';
    const lastName = searchParams.get('lastName') || '';
    const avatarUrl = searchParams.get('avatar') || '';

    if (!email) {
      setOverlay({
        title: 'Google registration unavailable',
        message:
          'We could not retrieve your Google account information. Please start registration again.',
      });

      return;
    }

    setForm({
      email,
      firstName,
      lastName,
      avatarUrl,
      phone: '',
      businessName: '',
    });
  }, [searchParams]);

  /*
   * ------------------------------------------------------------
   * Theme toggle
   * ------------------------------------------------------------
   */

  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    localStorage.setItem(
      'sami_theme',
      next ? 'dark' : 'light'
    );
  };

  /*
   * ------------------------------------------------------------
   * Update form
   * ------------------------------------------------------------
   */

  const updateField = (
    field: keyof AccountForm,
    value: string
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  /*
   * ------------------------------------------------------------
   * Continue
   * ------------------------------------------------------------
   */

  const handleNext = () => {
    const businessName = form.businessName.trim();

    if (!form.email) {
      setOverlay({
        title: 'Google account unavailable',
        message:
          'Your Google account information is missing. Please restart the Google sign-up process.',
      });

      return;
    }

    if (!businessName) {
      setOverlay({
        title: 'Business Name Required',
        message:
          'Please enter your business name before continuing.',
      });

      return;
    }

    if (businessName.length < 2) {
      setOverlay({
        title: 'Business Name Too Short',
        message:
          'Your business name should contain at least 2 characters.',
      });

      return;
    }

    setLoading(true);

    try {
      /*
       * Temporary registration state.
       *
       * This is NOT authentication.
       * The server must still validate all information.
       */

      sessionStorage.setItem(
        'sami_account_form',
        JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          businessName,
          avatarUrl: form.avatarUrl,

          googleAuth: true,
          authProvider: 'google',
        })
      );

      router.push('/auth/select-apps');
    } catch (error) {
      console.error(
        'Failed to save Google registration state:',
        error
      );

      setLoading(false);

      setOverlay({
        title: 'Something Went Wrong',
        message:
          'We could not save your registration details. Please try again.',
      });
    }
  };

  /*
   * ------------------------------------------------------------
   * Render
   * ------------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      {/* Theme */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          darkMode
            ? 'Switch to light mode'
            : 'Switch to dark mode'
        }
        className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
      >
        {darkMode ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">

            {/* Brand */}
            <div className="mb-7">
              <Link
                href="/"
                className="inline-flex flex-col items-start"
              >
                <SaMiLogo size="lg" />

                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
                  AI-powered business workspace
                </span>
              </Link>
            </div>

            {/* Header */}
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2
                  size={17}
                  className="text-green-600 dark:text-green-400"
                />

                <span className="text-[12px] font-medium text-green-600 dark:text-green-400">
                  Google account connected
                </span>
              </div>

              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                Complete your workspace
              </h1>

              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                One more step. Tell us about your business.
              </p>
            </div>

            {/* Google Account */}
            <div className="mb-7 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl flex items-center gap-4 border border-gray-100 dark:border-gray-800">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {(form.firstName ||
                    form.email ||
                    'S')
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {form.firstName || form.lastName
                    ? `${form.firstName} ${form.lastName}`.trim()
                    : 'Google account'}
                </p>

                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {form.email}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0">
                <CheckCircle2 size={14} />
                Google
              </div>
            </div>

            {/* Form */}
            <div className="space-y-5">

              {/* Business Name */}
              <div>
                <label
                  htmlFor="businessName"
                  className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300"
                >
                  Business Name
                  <span className="ml-1 text-red-500">
                    *
                  </span>
                </label>

                <div className="relative">
                  <Building2
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />

                  <input
                    id="businessName"
                    type="text"
                    value={form.businessName}
                    onChange={(event) =>
                      updateField(
                        'businessName',
                        event.target.value
                      )
                    }
                    placeholder="Acme Ltd"
                    autoComplete="organization"
                    maxLength={120}
                    className="w-full h-[46px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>

                <p className="mt-1.5 text-[11px] text-gray-400">
                  This will be the name of your SaMi workspace.
                </p>
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="phone"
                  className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300"
                >
                  Phone
                  <span className="ml-1 font-normal text-gray-400">
                    optional
                  </span>
                </label>

                <div className="relative">
                  <Phone
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />

                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      updateField(
                        'phone',
                        event.target.value
                      )
                    }
                    placeholder="+254 700 000 000"
                    autoComplete="tel"
                    maxLength={30}
                    className="w-full h-[46px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading || !form.email}
                  className="min-w-[175px] h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Continuing...
                    </>
                  ) : (
                    <>
                      Next: Select Apps
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link
            href="/help"
            className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Help
          </Link>

          <Link
            href="/auth/terms"
            className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Terms
          </Link>

          <Link
            href="/auth/privacy"
            className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Privacy
          </Link>
        </div>
      </div>

      {/* Error overlay */}
      {overlay && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              onClick={() => setOverlay(null)}
              aria-label="Close"
              className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={17} />
            </button>

            <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle
                size={25}
                className="text-red-600"
              />
            </div>

            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">
              {overlay.title}
            </h2>

            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              {overlay.message}
            </p>

            <button
              type="button"
              onClick={() => setOverlay(null)}
              className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function GoogleCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] dark:bg-[#0b0d10] text-gray-500 dark:text-gray-400 text-sm">
          Loading...
        </div>
      }
    >
      <GoogleCompleteContent />
    </Suspense>
  );
}