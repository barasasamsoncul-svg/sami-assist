import Link from 'next/link';

import {
  AppWindow,
  ArrowRight,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/* ============================================================
   TYPES
   ============================================================ */

type PreviewApp = {
  name: string;
  icon: LucideIcon;
};

type DashboardItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

/* ============================================================
   PREVIEW DATA

   This is only a structural product preview.

   We deliberately avoid invented:
   - revenue totals
   - invoice amounts
   - customer counts
   - AI results
   - usage numbers

   The real dashboard will later populate these areas from
   installed apps and actual workspace data.
   ============================================================ */

const previewApps: PreviewApp[] = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Invoicing',
    icon: Receipt,
  },
  {
    name: 'CRM',
    icon: Users,
  },
  {
    name: 'Inventory',
    icon: Package,
  },
  {
    name: 'Projects',
    icon: FileText,
  },
];

const dashboardItems: DashboardItem[] = [
  {
    title: 'Your work',
    description:
      'Tasks and activities that need your attention.',
    icon: CheckCircle2,
  },
  {
    title: 'Business activity',
    description:
      'Updates from the apps in your workspace.',
    icon: Workflow,
  },
  {
    title: 'Quick actions',
    description:
      'Start common business actions without searching.',
    icon: Plus,
  },
];

/* ============================================================
   HERO
   ============================================================ */

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">

      {/* ======================================================
          BACKGROUND
          ====================================================== */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-180px] -z-10 h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-100/70 blur-[130px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-220px] top-[360px] -z-10 h-[500px] w-[500px] rounded-full bg-violet-100/50 blur-[120px]"
      />

      <div className="mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">

        {/* ====================================================
            LEFT
            ==================================================== */}

        <div>

          {/* EYEBROW */}

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-4 py-2 text-xs font-black text-blue-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />

            AI powered business workspace
          </div>

          {/* HEADLINE */}

          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[1.03] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-[72px]">

            Run your business from

            <span className="block text-blue-600">
              one intelligent workspace.
            </span>
          </h1>

          {/* DESCRIPTION */}

          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            SaMi brings your business applications, people,
            information and AI together so your team can manage
            work from one connected platform instead of jumping
            between disconnected systems.
          </p>

          {/* ==================================================
              ACTIONS
              ================================================== */}

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">

            <Link
              href="/register"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-600/20 transition duration-200 hover:bg-blue-700"
            >
              Build your workspace

              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/#features"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-sm font-black text-slate-800 transition duration-200 hover:border-slate-400 hover:bg-slate-50"
            >
              Explore SaMi
            </Link>
          </div>

          <p className="mt-5 text-sm text-slate-500">
            Create your account, set up your business and choose
            the applications your workspace needs.
          </p>

          {/* ==================================================
              TRUST / PLATFORM MODEL
              ================================================== */}

          <div className="mt-12 grid max-w-2xl gap-5 border-t border-slate-200 pt-8 sm:grid-cols-3">

            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="h-4 w-4" />
              </div>

              <p className="mt-3 text-sm font-black text-slate-950">
                One workspace
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Your business and apps together.
              </p>
            </div>

            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Users className="h-4 w-4" />
              </div>

              <p className="mt-3 text-sm font-black text-slate-950">
                Built for teams
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Accounts, roles and controlled access.
              </p>
            </div>

            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Bot className="h-4 w-4" />
              </div>

              <p className="mt-3 text-sm font-black text-slate-950">
                SaMi AI
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Intelligence across permitted workspace context.
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            RIGHT — SAMI WORKSPACE PREVIEW
            ==================================================== */}

        <div className="relative mx-auto w-full max-w-[620px]">

          {/* GLOW */}

          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-[40px] bg-blue-600/10 blur-3xl"
          />

          {/* PRODUCT WINDOW */}

          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-25px_rgba(15,23,42,0.28)]">

            {/* ==================================================
                WINDOW BAR
                ================================================== */}

            <div className="flex h-14 items-center border-b border-slate-200 bg-slate-50/90 px-4">

              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              </div>

              <div className="mx-auto flex h-8 w-full max-w-[250px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                <Search className="h-3.5 w-3.5 text-slate-400" />

                <span className="text-[10px] text-slate-400">
                  Search SaMi
                </span>
              </div>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                <Bell className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* ==================================================
                WORKSPACE
                ================================================== */}

            <div className="grid min-h-[540px] grid-cols-[138px_minmax(0,1fr)] sm:grid-cols-[168px_minmax(0,1fr)]">

              {/* ================================================
                  SIDEBAR
                  ================================================ */}

              <aside className="border-r border-slate-100 bg-slate-50/80 p-3 sm:p-4">

                {/* WORKSPACE SWITCHER */}

                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">

                  <div className="flex items-center gap-2">

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Building2 className="h-3.5 w-3.5" />
                    </div>

                    <div className="hidden min-w-0 flex-1 sm:block">
                      <p className="truncate text-[10px] font-black text-slate-900">
                        My Business
                      </p>

                      <p className="mt-0.5 truncate text-[8px] text-slate-400">
                        Workspace
                      </p>
                    </div>

                    <ChevronDown className="hidden h-3 w-3 shrink-0 text-slate-400 sm:block" />
                  </div>
                </div>

                {/* NAVIGATION */}

                <div className="mt-5">

                  <p className="hidden px-2 text-[7px] font-black uppercase tracking-[0.15em] text-slate-400 sm:block">
                    Workspace
                  </p>

                  <div className="mt-2 space-y-1">

                    {previewApps.map(
                      (
                        app,
                        index
                      ) => {
                        const Icon =
                          app.icon;

                        const selected =
                          index === 0;

                        return (
                          <div
                            key={
                              app.name
                            }
                            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[9px] font-bold ${
                              selected
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                                : 'text-slate-500'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />

                            <span className="hidden truncate sm:block">
                              {app.name}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* APPS */}

                <div className="mt-5 border-t border-slate-200 pt-4">

                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[9px] font-bold text-slate-500">
                    <AppWindow className="h-3.5 w-3.5 shrink-0" />

                    <span className="hidden sm:block">
                      All apps
                    </span>
                  </div>
                </div>
              </aside>

              {/* ================================================
                  MAIN CONTENT
                  ================================================ */}

              <div className="min-w-0 bg-white p-4 sm:p-5">

                {/* TOP */}

                <div className="flex items-start justify-between gap-3">

                  <div>
                    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Workspace
                    </p>

                    <h3 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl">
                      Good morning
                    </h3>

                    <p className="mt-1 max-w-xs text-[9px] leading-4 text-slate-400">
                      Here&apos;s what needs your attention across SaMi.
                    </p>
                  </div>

                  <div className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 text-[8px] font-black text-violet-700">
                    <Sparkles className="h-3 w-3" />

                    <span className="hidden sm:inline">
                      SaMi AI
                    </span>
                  </div>
                </div>

                {/* ==============================================
                    DASHBOARD SECTIONS
                    ============================================== */}

                <div className="mt-6 grid gap-2.5 sm:grid-cols-3">

                  {dashboardItems.map(
                    (
                      item
                    ) => {
                      const Icon =
                        item.icon;

                      return (
                        <div
                          key={
                            item.title
                          }
                          className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                            <Icon className="h-3.5 w-3.5" />
                          </div>

                          <p className="mt-3 text-[9px] font-black text-slate-900">
                            {item.title}
                          </p>

                          <p className="mt-1 hidden text-[8px] leading-4 text-slate-400 sm:block">
                            {item.description}
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* ==============================================
                    SAMI AI
                    ============================================== */}

                <div className="relative mt-4 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-violet-50 p-4">

                  <div
                    aria-hidden="true"
                    className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-300/30 blur-2xl"
                  />

                  <div className="relative">

                    <div className="flex items-center gap-2.5">

                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <Bot className="h-4 w-4" />
                      </div>

                      <div>
                        <p className="text-[10px] font-black text-slate-950">
                          Ask SaMi
                        </p>

                        <p className="text-[8px] text-slate-500">
                          Work with your business context
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white bg-white/90 p-3 shadow-sm">

                      <p className="text-[9px] leading-5 text-slate-600">
                        Ask about your workspace, summarize
                        information or get help completing work
                        across the apps you can access.
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">

                        <span className="truncate text-[8px] text-slate-400">
                          Ask SaMi anything about your work...
                        </span>

                        <ArrowRight className="h-3 w-3 shrink-0 text-blue-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ==============================================
                    BUSINESS ACTIVITY
                    ============================================== */}

                <div className="mt-5">

                  <div className="flex items-center justify-between">

                    <div>
                      <p className="text-[10px] font-black text-slate-950">
                        Business activity
                      </p>

                      <p className="mt-0.5 hidden text-[8px] text-slate-400 sm:block">
                        Updates from your installed applications
                      </p>
                    </div>

                    <span className="text-[8px] font-bold text-blue-600">
                      View activity
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">

                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">

                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Receipt className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold text-slate-700">
                          Invoicing activity
                        </p>

                        <p className="mt-0.5 truncate text-[8px] text-slate-400">
                          Updates from your invoicing app appear here.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">

                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <Users className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold text-slate-700">
                          Team and customer activity
                        </p>

                        <p className="mt-0.5 truncate text-[8px] text-slate-400">
                          Relevant workspace events stay connected.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ==============================================
                    APP SHORTCUTS
                    ============================================== */}

                <div className="mt-5 border-t border-slate-100 pt-4">

                  <div className="flex items-center gap-2">

                    <span className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Installed apps
                    </span>

                    <div className="h-px flex-1 bg-slate-100" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">

                    {[
                      {
                        label:
                          'Invoicing',

                        icon:
                          Receipt,
                      },

                      {
                        label:
                          'CRM',

                        icon:
                          Users,
                      },

                      {
                        label:
                          'Inventory',

                        icon:
                          Package,
                      },
                    ].map(
                      (
                        app
                      ) => {
                        const Icon =
                          app.icon;

                        return (
                          <div
                            key={
                              app.label
                            }
                            className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 text-[8px] font-bold text-slate-600"
                          >
                            <Icon className="h-3 w-3" />

                            <span className="hidden sm:inline">
                              {app.label}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================
              FLOATING PLATFORM CARD
              ================================================== */}

          <div className="absolute -bottom-5 -left-4 hidden w-[200px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl lg:block">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Workflow className="h-4 w-4" />
              </div>

              <div>
                <p className="text-[9px] font-black text-slate-900">
                  Connected workspace
                </p>

                <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
                  Apps work on one platform.
                </p>
              </div>
            </div>
          </div>

          {/* ==================================================
              FLOATING AI CARD
              ================================================== */}

          <div className="absolute -right-4 top-20 hidden w-[190px] rounded-2xl border border-violet-100 bg-white p-3.5 shadow-xl xl:block">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                <Bot className="h-4 w-4" />
              </div>

              <div>
                <p className="text-[9px] font-black text-slate-900">
                  SaMi AI
                </p>

                <p className="mt-0.5 text-[8px] leading-4 text-slate-400">
                  Core to the workspace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}