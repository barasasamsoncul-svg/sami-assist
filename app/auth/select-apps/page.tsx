
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  Moon,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Calculator,
  Receipt,
  FileText,
  BarChart,
  Folder,
  PenTool,
  Users,
  ShoppingCart,
  Repeat,
  Home,
  Store,
  Utensils,
  Package,
  Factory,
  Boxes,
  ShoppingBag,
  Wrench,
  ShieldCheck,
  UserRound,
  Car,
  UserPlus,
  ClipboardCheck,
  CalendarOff,
  UserSearch,
  Megaphone,
  Mail,
  MessageSquare,
  CalendarDays,
  Workflow,
  ClipboardList,
  Briefcase,
  Clock,
  MapPin,
  Headphones,
  CalendarClock,
  Calendar,
  type LucideIcon,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';
import {
  SAMI_APPS,
  APP_CATEGORIES,
} from '@/lib/sami-apps';

/* -------------------------------------------------------------------------- */
/* Icon mapping                                                               */
/* -------------------------------------------------------------------------- */

const iconMap: Record<string, LucideIcon> = {
  calculator: Calculator,
  receipt: Receipt,
  'file-text': FileText,
  'bar-chart': BarChart,
  folder: Folder,
  'pen-tool': PenTool,
  users: Users,
  'shopping-cart': ShoppingCart,
  repeat: Repeat,
  home: Home,
  store: Store,
  utensils: Utensils,
  package: Package,
  factory: Factory,
  boxes: Boxes,
  'shopping-bag': ShoppingBag,
  wrench: Wrench,
  'shield-check': ShieldCheck,
  'user-round': UserRound,
  car: Car,
  'user-plus': UserPlus,
  'clipboard-check': ClipboardCheck,
  'calendar-off': CalendarOff,
  'user-search': UserSearch,
  megaphone: Megaphone,
  mail: Mail,
  'message-square': MessageSquare,
  'calendar-days': CalendarDays,
  workflow: Workflow,
  'clipboard-list': ClipboardList,
  briefcase: Briefcase,
  clock: Clock,
  'map-pin': MapPin,
  headphones: Headphones,
  'calendar-clock': CalendarClock,
  calendar: Calendar,
};

function getIconComponent(iconName?: string): LucideIcon {
  if (!iconName) return Package;
  return iconMap[iconName] ?? Package;
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type OverlayState = {
  type: 'error';
  title: string;
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function SelectAppsPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Theme                                                                    */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('sami_theme');
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;

      const shouldUseDark =
        savedTheme === 'dark' ||
        (!savedTheme && prefersDark);

      setDarkMode(shouldUseDark);

      document.documentElement.classList.toggle(
        'dark',
        shouldUseDark
      );
    } catch {
      // Ignore localStorage/theme errors.
    }
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Restore previously selected apps                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    try {
      const savedApps = sessionStorage.getItem('sami_selected_apps');

      if (!savedApps) return;

      const parsed = JSON.parse(savedApps);

      if (!Array.isArray(parsed)) return;

      const validAppKeys = new Set(
        SAMI_APPS.map((app) => app.key)
      );

      const validSelectedApps = parsed.filter(
        (key): key is string =>
          typeof key === 'string' &&
          validAppKeys.has(key)
      );

      setSelectedApps(validSelectedApps);
    } catch {
      // Ignore invalid session storage data.
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    try {
      localStorage.setItem(
        'sami_theme',
        next ? 'dark' : 'light'
      );
    } catch {
      // Ignore localStorage errors.
    }
  };

  /* ------------------------------------------------------------------------ */
  /* App selection                                                            */
  /* ------------------------------------------------------------------------ */

  const toggleApp = (appKey: string) => {
    setSelectedApps((current) => {
      const next = current.includes(appKey)
        ? current.filter((key) => key !== appKey)
        : [...current, appKey];

      try {
        sessionStorage.setItem(
          'sami_selected_apps',
          JSON.stringify(next)
        );
      } catch {
        // Ignore sessionStorage errors.
      }

      return next;
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Filtering                                                                */
  /* ------------------------------------------------------------------------ */

  const filteredApps = useMemo(() => {
    if (activeCategory === 'all') {
      return SAMI_APPS;
    }

    return SAMI_APPS.filter(
      (app) => app.category === activeCategory
    );
  }, [activeCategory]);

  /* ------------------------------------------------------------------------ */
  /* Continue                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleNext = () => {
    if (selectedApps.length === 0) {
      setOverlay({
        type: 'error',
        title: 'No Apps Selected',
        message:
          'Select at least one app to continue. You can always add more apps later.',
      });

      return;
    }

    try {
      sessionStorage.setItem(
        'sami_selected_apps',
        JSON.stringify(selectedApps)
      );
    } catch {
      setOverlay({
        type: 'error',
        title: 'Unable to save selection',
        message:
          'Your browser could not save the selected apps. Please check your browser storage settings and try again.',
      });

      return;
    }

    router.push('/auth/select-plan');
  };

  /* ------------------------------------------------------------------------ */
  /* Back                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleBack = () => {
    try {
      sessionStorage.setItem(
        'sami_selected_apps',
        JSON.stringify(selectedApps)
      );
    } catch {
      // Ignore storage errors when going back.
    }

    router.back();
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      {/* Theme button */}
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
        {/* Main card */}
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-6 py-7 sm:px-10 sm:py-9">

            {/* ---------------------------------------------------------------- */}
            {/* Brand                                                            */}
            {/* ---------------------------------------------------------------- */}

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

            {/* ---------------------------------------------------------------- */}
            {/* Header                                                           */}
            {/* ---------------------------------------------------------------- */}

            <div className="mb-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                    Select your apps
                  </h1>

                  <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                    Choose the apps your business needs.
                  </p>
                </div>

                <div className="hidden sm:flex h-9 px-3 rounded-full items-center justify-center bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    Step 2 of 3
                  </span>
                </div>
              </div>

              {/* Mobile step indicator */}
              <div className="mt-4 sm:hidden">
                <span className="inline-flex h-7 px-3 items-center rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  Step 2 of 3
                </span>
              </div>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* Category tabs                                                     */}
            {/* ---------------------------------------------------------------- */}

            <div className="mb-5">
              <div className="flex flex-wrap gap-1.5">
                {/* All */}
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition ${
                    activeCategory === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  All ({SAMI_APPS.length})
                </button>

                {/* Categories */}
                {APP_CATEGORIES.map((category) => {
                  const categoryCount = SAMI_APPS.filter(
                    (app) =>
                      app.category === category.key
                  ).length;

                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() =>
                        setActiveCategory(category.key)
                      }
                      className={`px-4 py-2 rounded-full text-xs font-medium transition ${
                        activeCategory === category.key
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {category.name} ({categoryCount})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* Selection summary                                                 */}
            {/* ---------------------------------------------------------------- */}

            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {filteredApps.length}{' '}
                {filteredApps.length === 1
                  ? 'app'
                  : 'apps'}{' '}
                available
              </p>

              <p className="text-[12px] text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedApps.length}
                </span>{' '}
                selected
              </p>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* Apps grid                                                         */}
            {/* ---------------------------------------------------------------- */}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1 mb-5">
              {filteredApps.map((app) => {
                const IconComponent = getIconComponent(
                  app.icon
                );

                const isSelected =
                  selectedApps.includes(app.key);

                const isRecommended =
                  Boolean(app.recommended);

                return (
                  <button
                    key={app.key}
                    type="button"
                    onClick={() => toggleApp(app.key)}
                    aria-pressed={isSelected}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    {/* Recommended badge */}
                    {isRecommended && (
                      <div className="absolute -top-1.5 right-3 bg-blue-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Recommended
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900/50'
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}
                      >
                        <IconComponent
                          size={16}
                          className={
                            isSelected
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {app.name}
                          </span>

                          {isSelected && (
                            <span className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                              <Check
                                size={12}
                                strokeWidth={3}
                                className="text-white"
                              />
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {app.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Empty category */}
              {filteredApps.length === 0 && (
                <div className="col-span-full py-12 text-center">
                  <div className="mx-auto h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Package
                      size={21}
                      className="text-gray-400"
                    />
                  </div>

                  <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
                    No apps in this category
                  </p>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Try another category.
                  </p>
                </div>
              )}
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* Bottom actions                                                    */}
            {/* ---------------------------------------------------------------- */}

            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedApps.length}
                  </span>{' '}
                  app
                  {selectedApps.length !== 1
                    ? 's'
                    : ''}{' '}
                  selected
                </p>

                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  You can change your apps later.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <ArrowLeft size={15} />
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="h-[44px] px-6 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition shadow-sm"
                >
                  Next: Plan
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------- */}
        {/* Footer links                                                         */}
        {/* -------------------------------------------------------------------- */}

        <div className="mt-4 flex flex-wrap justify-end items-center gap-x-5 gap-y-2 px-1">
          <Link
            href="/auth/login"
            className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition"
          >
            Sign In
          </Link>

          <Link
            href="/help"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Help
          </Link>

          <Link
            href="/auth/terms"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Terms
          </Link>

          <Link
            href="/auth/privacy"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Privacy
          </Link>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* Error overlay                                                          */}
      {/* ---------------------------------------------------------------------- */}

      {overlay && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => setOverlay(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="apps-error-title"
            className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setOverlay(null)}
              aria-label="Close"
              className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X size={17} />
            </button>

            {/* Icon */}
            <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle
                size={25}
                className="text-red-600 dark:text-red-400"
              />
            </div>

            {/* Message */}
            <h2
              id="apps-error-title"
              className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white"
            >
              {overlay.title}
            </h2>

            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              {overlay.message}
            </p>

            {/* Action */}
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