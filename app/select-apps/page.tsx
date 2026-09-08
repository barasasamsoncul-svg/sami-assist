'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BarChart,
  Bot,
  Boxes,
  Briefcase,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  Folder,
  Headphones,
  Home,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Moon,
  Package,
  PenTool,
  Receipt,
  Repeat,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  UserPlus,
  UserRound,
  Users,
  UserSearch,
  Utensils,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  APP_CATEGORIES,
  SAMI_APPS,
} from '@/lib/sami-apps';

/* ============================================================
   CONSTANTS
   ============================================================ */

const SELECTED_APPS_STORAGE_KEY =
  'sami_selected_apps';

const THEME_STORAGE_KEY =
  'sami_theme';

const NEXT_ROUTE =
  '/select-plan';

/* ============================================================
   ICON REGISTRY
   ============================================================ */

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
  'calendar-off': Calendar,
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

function getIconComponent(
  iconName?: string
): LucideIcon {
  if (!iconName) {
    return Package;
  }

  return iconMap[iconName] ?? Package;
}

/* ============================================================
   APP COLOR SYSTEM
   ============================================================ */

type AppPalette = {
  tile: string;
  tileSelected: string;
  glow: string;
  badge: string;
  border: string;
};

const APP_PALETTES: AppPalette[] = [
  {
    tile:
      'from-[#8b5cf6] to-[#6d28d9]',
    tileSelected:
      'from-[#7c3aed] to-[#5b21b6]',
    glow:
      'shadow-violet-500/25',
    badge:
      'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    border:
      'hover:border-violet-300 dark:hover:border-violet-700',
  },
  {
    tile:
      'from-[#06b6d4] to-[#0284c7]',
    tileSelected:
      'from-[#0891b2] to-[#0369a1]',
    glow:
      'shadow-cyan-500/25',
    badge:
      'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
    border:
      'hover:border-cyan-300 dark:hover:border-cyan-700',
  },
  {
    tile:
      'from-[#10b981] to-[#047857]',
    tileSelected:
      'from-[#059669] to-[#065f46]',
    glow:
      'shadow-emerald-500/25',
    badge:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    border:
      'hover:border-emerald-300 dark:hover:border-emerald-700',
  },
  {
    tile:
      'from-[#f97316] to-[#ea580c]',
    tileSelected:
      'from-[#ea580c] to-[#c2410c]',
    glow:
      'shadow-orange-500/25',
    badge:
      'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
    border:
      'hover:border-orange-300 dark:hover:border-orange-700',
  },
  {
    tile:
      'from-[#ec4899] to-[#be185d]',
    tileSelected:
      'from-[#db2777] to-[#9d174d]',
    glow:
      'shadow-pink-500/25',
    badge:
      'bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
    border:
      'hover:border-pink-300 dark:hover:border-pink-700',
  },
  {
    tile:
      'from-[#3b82f6] to-[#1d4ed8]',
    tileSelected:
      'from-[#2563eb] to-[#1e40af]',
    glow:
      'shadow-blue-500/25',
    badge:
      'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    border:
      'hover:border-blue-300 dark:hover:border-blue-700',
  },
  {
    tile:
      'from-[#eab308] to-[#ca8a04]',
    tileSelected:
      'from-[#d4a106] to-[#a16207]',
    glow:
      'shadow-yellow-500/25',
    badge:
      'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300',
    border:
      'hover:border-yellow-300 dark:hover:border-yellow-700',
  },
  {
    tile:
      'from-[#ef4444] to-[#b91c1c]',
    tileSelected:
      'from-[#dc2626] to-[#991b1b]',
    glow:
      'shadow-red-500/25',
    badge:
      'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    border:
      'hover:border-red-300 dark:hover:border-red-700',
  },
  {
    tile:
      'from-[#14b8a6] to-[#0f766e]',
    tileSelected:
      'from-[#0d9488] to-[#115e59]',
    glow:
      'shadow-teal-500/25',
    badge:
      'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
    border:
      'hover:border-teal-300 dark:hover:border-teal-700',
  },
  {
    tile:
      'from-[#6366f1] to-[#4338ca]',
    tileSelected:
      'from-[#4f46e5] to-[#3730a3]',
    glow:
      'shadow-indigo-500/25',
    badge:
      'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
    border:
      'hover:border-indigo-300 dark:hover:border-indigo-700',
  },
  {
    tile:
      'from-[#a855f7] to-[#7e22ce]',
    tileSelected:
      'from-[#9333ea] to-[#6b21a8]',
    glow:
      'shadow-purple-500/25',
    badge:
      'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
    border:
      'hover:border-purple-300 dark:hover:border-purple-700',
  },
  {
    tile:
      'from-[#f43f5e] to-[#be123c]',
    tileSelected:
      'from-[#e11d48] to-[#9f1239]',
    glow:
      'shadow-rose-500/25',
    badge:
      'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    border:
      'hover:border-rose-300 dark:hover:border-rose-700',
  },
];

/*
 * Important SaMi apps keep consistent
 * recognizable colors.
 */
const APP_PALETTE_OVERRIDES: Record<
  string,
  number
> = {
  accounting: 2,
  finance: 2,

  invoice: 5,
  invoices: 5,
  invoicing: 5,

  crm: 0,

  sale: 1,
  sales: 1,

  pos: 11,
  'point-of-sale': 11,
  point_of_sale: 11,

  inventory: 3,
  stock: 3,

  purchase: 6,
  purchases: 6,

  ecommerce: 4,
  'e-commerce': 4,
  e_commerce: 4,

  project: 9,
  projects: 9,

  hr: 10,
  employees: 10,

  marketing: 7,

  manufacturing: 8,
  mrp: 8,
};

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function hashString(value: string) {
  let hash = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash =
      (hash * 31 +
        value.charCodeAt(index)) >>>
      0;
  }

  return hash;
}

function getAppPalette(
  key: string,
  category: string
): AppPalette {
  const normalized =
    normalizeKey(key);

  const override =
    APP_PALETTE_OVERRIDES[
      normalized
    ];

  if (override !== undefined) {
    return APP_PALETTES[
      override %
        APP_PALETTES.length
    ];
  }

  const index =
    hashString(
      `${category}:${normalized}`
    ) % APP_PALETTES.length;

  return APP_PALETTES[index];
}

/* ============================================================
   CATEGORY COLORS
   ============================================================ */

const CATEGORY_COLORS: Record<
  string,
  string
> = {
  finance:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',

  documents:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',

  sales:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',

  commerce:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300',

  supply_chain:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',

  operations:
    'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',

  people:
    'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300',

  marketing:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',

  work:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300',
};

/* ============================================================
   TYPES
   ============================================================ */

type OverlayState = {
  type:
    | 'error'
    | 'warning'
    | 'success'
    | 'info';

  title: string;
  message: string;
};

/* ============================================================
   STORAGE
   ============================================================ */

function getValidAppKeys() {
  return new Set(
    SAMI_APPS.map(
      (app) => app.key
    )
  );
}

function sanitizeSelectedApps(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validKeys =
    getValidAppKeys();

  const output: string[] = [];

  for (const item of value) {
    if (
      typeof item === 'string' &&
      validKeys.has(item) &&
      !output.includes(item)
    ) {
      output.push(item);
    }
  }

  return output;
}

function readSelectedApps() {
  if (
    typeof window === 'undefined'
  ) {
    return [];
  }

  try {
    const raw =
      sessionStorage.getItem(
        SELECTED_APPS_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    return sanitizeSelectedApps(
      JSON.parse(raw)
    );
  } catch {
    return [];
  }
}

function saveSelectedApps(
  apps: string[]
) {
  if (
    typeof window === 'undefined'
  ) {
    return false;
  }

  try {
    sessionStorage.setItem(
      SELECTED_APPS_STORAGE_KEY,
      JSON.stringify(
        sanitizeSelectedApps(
          apps
        )
      )
    );

    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   PAGE
   ============================================================ */

export default function SelectAppsPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] =
    useState(false);

  const [
    selectedApps,
    setSelectedApps,
  ] = useState<string[]>([]);

  const [
    activeCategory,
    setActiveCategory,
  ] = useState('all');

  const [search, setSearch] =
    useState('');

  const [
    navigating,
    setNavigating,
  ] = useState(false);

  const [overlay, setOverlay] =
    useState<OverlayState | null>(
      null
    );

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const storedTheme =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const shouldUseDark =
        storedTheme === 'dark' ||
        (!storedTheme &&
          systemDark);

      setDarkMode(
        shouldUseDark
      );

      document.documentElement.classList.toggle(
        'dark',
        shouldUseDark
      );
    } catch {
      // Theme still works without storage.
    }
  }, []);

  const toggleTheme =
    useCallback(() => {
      setDarkMode(
        (current) => {
          const next =
            !current;

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
            // Ignore storage errors.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     RESTORE APP SELECTION
     ========================================================== */

  useEffect(() => {
    const restored =
      readSelectedApps();

    setSelectedApps(restored);

    /*
     * Re-save so stale or duplicate
     * app keys are normalized.
     */
    saveSelectedApps(restored);
  }, []);

  /* ==========================================================
     DERIVED DATA
     ========================================================== */

  const selectedSet =
    useMemo(
      () =>
        new Set(
          selectedApps
        ),
      [selectedApps]
    );

  const recommendedKeys =
    useMemo(() => {
      return SAMI_APPS.filter(
        (app) =>
          Boolean(
            app.recommended
          )
      ).map(
        (app) => app.key
      );
    }, []);

  const categoryCounts =
    useMemo(() => {
      const counts =
        new Map<
          string,
          number
        >();

      for (const app of SAMI_APPS) {
        counts.set(
          app.category,
          (counts.get(
            app.category
          ) ?? 0) + 1
        );
      }

      return counts;
    }, []);

  const filteredApps =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return SAMI_APPS.filter(
        (app) => {
          if (
            activeCategory !==
              'all' &&
            app.category !==
              activeCategory
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const categoryName =
            APP_CATEGORIES.find(
              (category) =>
                category.key ===
                app.category
            )?.name ?? '';

          return [
            app.name,
            app.description,
            app.key,
            categoryName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query);
        }
      );
    }, [
      activeCategory,
      search,
    ]);

  /* ==========================================================
     SELECTION
     ========================================================== */

  const persistSelection =
    useCallback(
      (apps: string[]) => {
        const sanitized =
          sanitizeSelectedApps(
            apps
          );

        setSelectedApps(
          sanitized
        );

        const saved =
          saveSelectedApps(
            sanitized
          );

        if (!saved) {
          setOverlay({
            type: 'error',
            title:
              'Selection could not be saved',
            message:
              'SaMi could not save your app selection in this browser. Check browser storage settings and try again.',
          });
        }
      },
      []
    );

  const toggleApp =
    useCallback(
      (appKey: string) => {
        if (navigating) {
          return;
        }

        const validKeys =
          getValidAppKeys();

        if (
          !validKeys.has(
            appKey
          )
        ) {
          return;
        }

        setSelectedApps(
          (current) => {
            const next =
              current.includes(
                appKey
              )
                ? current.filter(
                    (key) =>
                      key !==
                      appKey
                  )
                : [
                    ...current,
                    appKey,
                  ];

            saveSelectedApps(
              next
            );

            return next;
          }
        );
      },
      [navigating]
    );

  function selectRecommended() {
    if (
      recommendedKeys.length ===
      0
    ) {
      return;
    }

    persistSelection([
      ...new Set([
        ...selectedApps,
        ...recommendedKeys,
      ]),
    ]);
  }

  function clearSelection() {
    persistSelection([]);
  }

  /* ==========================================================
     NAVIGATION
     ========================================================== */

  function handleBack() {
    if (navigating) {
      return;
    }

    saveSelectedApps(
      selectedApps
    );

    router.back();
  }

  function handleNext() {
    if (navigating) {
      return;
    }

    if (
      selectedApps.length ===
      0
    ) {
      setOverlay({
        type: 'warning',
        title:
          'Choose at least one app',
        message:
          'Select at least one business app to continue. You can install or remove apps later from your SaMi workspace.',
      });

      return;
    }

    const saved =
      saveSelectedApps(
        selectedApps
      );

    if (!saved) {
      setOverlay({
        type: 'error',
        title:
          'Selection could not be saved',
        message:
          'SaMi could not save your app selection. Check browser storage settings and try again.',
      });

      return;
    }

    setNavigating(true);

    router.push(
      NEXT_ROUTE
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={overlay.type}
          title={overlay.title}
          message={
            overlay.message
          }
          primaryAction={{
            label: 'Continue',
            onClick: () =>
              setOverlay(null),
          }}
          onClose={() =>
            setOverlay(null)
          }
        />
      )}

      <main className="relative min-h-screen overflow-x-hidden bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            BACKGROUND
           ==================================================== */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-52 -top-52 h-[620px] w-[620px] rounded-full bg-blue-500/[0.06] blur-[120px] dark:bg-blue-500/[0.09]" />

          <div className="absolute -bottom-52 right-[-180px] h-[620px] w-[620px] rounded-full bg-violet-500/[0.06] blur-[120px] dark:bg-violet-500/[0.08]" />
        </div>

        {/* ====================================================
            THEME
           ==================================================== */}

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* ====================================================
            PAGE CONTENT

            Extra pb space ensures the fixed action dock
            never covers app content.
           ==================================================== */}

        <div className="relative mx-auto w-full max-w-[1500px] px-4 pb-36 pt-7 sm:px-6 lg:px-8">

          {/* ==================================================
              LOGO
             ================================================== */}

          <header className="pr-12">
            <Link
              href="/"
              aria-label="SaMi home"
              className="inline-block max-w-full"
            >
              {/* FULL APPROVED LOGO */}
              <SaMiLogo
                size="lg"
                className="max-w-full"
              />
            </Link>
          </header>

          {/* ==================================================
              PROGRESS
             ================================================== */}

          <div className="mt-7 flex items-center gap-3">
            <OnboardingStep
              number="1"
              label="Account"
              completed
            />

            <div className="h-px flex-1 bg-emerald-300 dark:bg-emerald-900" />

            <OnboardingStep
              number="2"
              label="Apps"
              active
            />

            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

            <OnboardingStep
              number="3"
              label="Plan"
            />
          </div>

          {/* ==================================================
              HEADING
             ================================================== */}

          <section className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                Step 2 of 3
              </p>

              <h1 className="mt-2 text-[30px] font-black tracking-[-0.035em] sm:text-[36px]">
                Choose your business apps
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Build your SaMi workspace
                with the apps your business
                needs. You can add or remove
                apps later.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {recommendedKeys.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    selectRecommended
                  }
                  disabled={navigating}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
                >
                  <Sparkles className="h-4 w-4" />

                  Select recommended
                </button>
              )}

              {selectedApps.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    clearSelection
                  }
                  disabled={navigating}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />

                  Clear
                </button>
              )}
            </div>
          </section>

          {/* ==================================================
              SaMi AI
             ================================================== */}

          <section className="relative mt-7 overflow-hidden rounded-[24px] border border-blue-200/70 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 px-5 py-4 dark:border-blue-900/60 dark:from-blue-950/30 dark:via-indigo-950/25 dark:to-violet-950/30">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-violet-400/20 blur-3xl"
            />

            <div className="relative flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                <Bot className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black">
                    SaMi AI
                  </h2>

                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-blue-700 dark:bg-white/10 dark:text-blue-300">
                    Core platform
                  </span>
                </div>

                <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                  SaMi AI is already included
                  in your workspace. Business
                  apps can provide additional
                  tools, data and context to
                  SaMi AI, so you do not need
                  to select AI as an app.
                </p>
              </div>
            </div>
          </section>

          {/* ==================================================
              APPS WORKSPACE
             ================================================== */}

          <section className="mt-7 overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_20px_70px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-[#0d111a]/95 dark:shadow-[0_20px_70px_rgba(0,0,0,0.25)]">

            {/* ================================================
                SEARCH + FILTERS
               ================================================ */}

            <div className="border-b border-slate-100 px-5 py-5 sm:px-7 dark:border-slate-800">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                {/* Search */}

                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <input
                    type="search"
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search apps"
                    aria-label="Search SaMi apps"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-blue-500 dark:focus:bg-slate-950"
                  />

                  {search && (
                    <button
                      type="button"
                      onClick={() =>
                        setSearch('')
                      }
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Selected count */}

                <div className="flex items-center gap-3">
                  <div className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-4 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />

                    <strong className="text-slate-950 dark:text-white">
                      {
                        selectedApps.length
                      }
                    </strong>

                    selected
                  </div>
                </div>
              </div>

              {/* Category filters */}

              <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                {/* All */}

                <button
                  type="button"
                  aria-pressed={
                    activeCategory ===
                    'all'
                  }
                  onClick={() =>
                    setActiveCategory(
                      'all'
                    )
                  }
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    activeCategory ===
                    'all'
                      ? 'border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  All ·{' '}
                  {SAMI_APPS.length}
                </button>

                {APP_CATEGORIES.map(
                  (category) => {
                    const active =
                      activeCategory ===
                      category.key;

                    const color =
                      CATEGORY_COLORS[
                        category.key
                      ] ??
                      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';

                    return (
                      <button
                        key={
                          category.key
                        }
                        type="button"
                        aria-pressed={
                          active
                        }
                        onClick={() =>
                          setActiveCategory(
                            category.key
                          )
                        }
                        className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                          active
                            ? color
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        {
                          category.name
                        }{' '}
                        ·{' '}
                        {categoryCounts.get(
                          category.key
                        ) ?? 0}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* ================================================
                APP GRID
               ================================================ */}

            <div className="p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {
                      filteredApps.length
                    }
                  </strong>{' '}
                  {filteredApps.length ===
                  1
                    ? 'app'
                    : 'apps'}
                </p>

                {activeCategory !==
                  'all' && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveCategory(
                        'all'
                      )
                    }
                    className="text-xs font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Show all
                  </button>
                )}
              </div>

              {filteredApps.length >
              0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredApps.map(
                    (app) => {
                      const Icon =
                        getIconComponent(
                          app.icon
                        );

                      const selected =
                        selectedSet.has(
                          app.key
                        );

                      const palette =
                        getAppPalette(
                          app.key,
                          app.category
                        );

                      const categoryName =
                        APP_CATEGORIES.find(
                          (
                            category
                          ) =>
                            category.key ===
                            app.category
                        )?.name ??
                        app.category;

                      return (
                        <AppTile
                          key={app.key}
                          name={app.name}
                          description={
                            app.description
                          }
                          category={
                            categoryName
                          }
                          recommended={Boolean(
                            app.recommended
                          )}
                          selected={
                            selected
                          }
                          disabled={
                            navigating
                          }
                          icon={Icon}
                          palette={
                            palette
                          }
                          onClick={() =>
                            toggleApp(
                              app.key
                            )
                          }
                        />
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                    <Search className="h-6 w-6" />
                  </div>

                  <h3 className="mt-4 text-sm font-black">
                    No apps found
                  </h3>

                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Try another search or
                    select a different app
                    category.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');

                      setActiveCategory(
                        'all'
                      );
                    }}
                    className="mt-4 text-xs font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ==================================================
              FOOTER
             ================================================== */}

          <footer className="mt-5 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 pb-4 text-[11px] text-slate-400">
            <Link
              href="/help"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Help
            </Link>

            <Link
              href="/terms"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Terms
            </Link>

            <Link
              href="/privacy"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Privacy
            </Link>
          </footer>
        </div>

        {/* ====================================================
            FIXED ONBOARDING ACTION DOCK

            User never needs to scroll down to find Next.
           ==================================================== */}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/92 px-4 py-3 shadow-[0_-15px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b0f18]/94">
          <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3">

            {/* Back */}

            <button
              type="button"
              onClick={handleBack}
              disabled={navigating}
              aria-label="Go back"
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />

              <span className="hidden sm:inline">
                Back
              </span>
            </button>

            {/* Selection status */}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">

                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black transition ${
                    selectedApps.length >
                    0
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  {selectedApps.length >
                  0 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    '0'
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                    {selectedApps.length ===
                    0
                      ? 'Choose at least one app'
                      : `${selectedApps.length} ${
                          selectedApps.length ===
                          1
                            ? 'app'
                            : 'apps'
                        } selected`}
                  </p>

                  <p className="hidden truncate text-[11px] text-slate-500 dark:text-slate-400 sm:block">
                    {selectedApps.length ===
                    0
                      ? 'Select the apps you want in your SaMi workspace.'
                      : 'You can change installed apps later from workspace settings.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Next */}

            <button
              type="button"
              onClick={handleNext}
              disabled={navigating}
              className="flex h-12 min-w-[138px] shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[190px]"
            >
              {navigating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  <span className="hidden sm:inline">
                    Opening plan...
                  </span>

                  <span className="sm:hidden">
                    Loading
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">
                    Continue to Plan
                  </span>

                  <span className="sm:hidden">
                    Next
                  </span>

                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   APP TILE
   ============================================================ */

function AppTile({
  name,
  description,
  category,
  recommended,
  selected,
  disabled,
  icon: Icon,
  palette,
  onClick,
}: {
  name: string;
  description?: string | null;
  category: string;
  recommended: boolean;
  selected: boolean;
  disabled: boolean;
  icon: LucideIcon;
  palette: AppPalette;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${
        selected
          ? 'Remove'
          : 'Select'
      } ${name}`}
      className={`
        group relative
        flex min-h-[220px]
        flex-col items-center
        rounded-[24px]
        border
        bg-white
        px-4 py-5
        text-center
        transition
        duration-200
        focus:outline-none
        focus:ring-4
        focus:ring-blue-500/10
        disabled:cursor-not-allowed
        disabled:opacity-60
        dark:bg-slate-900
        ${
          selected
            ? 'border-blue-500 shadow-[0_14px_35px_rgba(37,99,235,0.13)] ring-2 ring-blue-500/15 dark:border-blue-500'
            : `border-slate-200 hover:-translate-y-1 hover:shadow-[0_16px_35px_rgba(15,23,42,0.10)] dark:border-slate-800 ${palette.border}`
        }
      `}
    >

      {/* Selected check */}

      {selected && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
          <Check
            className="h-3.5 w-3.5"
            strokeWidth={3}
          />
        </span>
      )}

      {/* Recommended badge */}

      {recommended && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          <Sparkles className="h-2.5 w-2.5" />

          Recommended
        </span>
      )}

      {/* Colored app icon */}

      <div
        className={`
          mt-5
          flex h-[68px] w-[68px]
          items-center justify-center
          rounded-[20px]
          bg-gradient-to-br
          ${
            selected
              ? palette.tileSelected
              : palette.tile
          }
          text-white
          shadow-lg
          ${palette.glow}
          transition
          duration-200
          group-hover:-rotate-1
          group-hover:scale-[1.06]
        `}
      >
        <Icon
          className="h-8 w-8"
          strokeWidth={1.7}
        />
      </div>

      {/* App name */}

      <h3 className="mt-4 w-full truncate text-[13px] font-black text-slate-900 dark:text-white">
        {name}
      </h3>

      {/* Description */}

      <p className="mt-1.5 line-clamp-2 text-[10px] leading-[16px] text-slate-500 dark:text-slate-400">
        {description ||
          `Open ${name} in your SaMi workspace.`}
      </p>

      {/* Category */}

      <span
        className={`mt-auto inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold ${palette.badge}`}
      >
        {category}
      </span>
    </button>
  );
}

/* ============================================================
   ONBOARDING STEP
   ============================================================ */

function OnboardingStep({
  number,
  label,
  active = false,
  completed = false,
}: {
  number: string;
  label: string;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
          completed
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {completed ? (
          <Check className="h-4 w-4" />
        ) : (
          number
        )}
      </span>

      <span
        className={`hidden text-xs font-bold sm:block ${
          active
            ? 'text-slate-950 dark:text-white'
            : completed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}