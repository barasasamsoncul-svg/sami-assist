import Link from 'next/link';

import {
  AppWindow,
  ArrowRight,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CheckCircle2,
  FileText,
  Headphones,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  User,
  Users,
  Workflow,
} from 'lucide-react';

import type {
  LucideIcon,
} from 'lucide-react';

/* ============================================================
   TYPES
   ============================================================ */

type Feature = {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type BusinessApp = {
  name: string;
  description: string;
  icon: LucideIcon;
};

/* ============================================================
   PLATFORM FEATURES
   ============================================================ */

const features: Feature[] = [
  {
    number: '01',

    title:
      'One workspace for the whole business',

    description:
      'Bring your business apps, people, work and information into one SaMi workspace instead of managing separate disconnected systems.',

    icon:
      AppWindow,
  },

  {
    number: '02',

    title:
      'AI that understands your workspace',

    description:
      'SaMi AI works alongside your business apps and can use permitted workspace context to help answer questions, find information, summarize activity and support everyday work.',

    icon:
      Bot,
  },

  {
    number: '03',

    title:
      'Connected business workflows',

    description:
      'Connect actions across your workspace so information can move between customers, invoices, inventory, projects, teams and other business processes without unnecessary repetition.',

    icon:
      Workflow,
  },

  {
    number: '04',

    title:
      'Built for owners and teams',

    description:
      'Give every person their own SaMi account while controlling what they can access inside each business workspace through memberships, roles and permissions.',

    icon:
      Users,
  },

  {
    number: '05',

    title:
      'Business data stays structured',

    description:
      'Keep operational data organized by workspace and application while SaMi provides one consistent platform for access, security and business management.',

    icon:
      ShieldCheck,
  },

  {
    number: '06',

    title:
      'Start simple and expand later',

    description:
      'Install the applications your business needs today, then add more capabilities as your team, customers and operations grow.',

    icon:
      Boxes,
  },
];

/* ============================================================
   BUSINESS APPS
   ============================================================ */

const businessApps: BusinessApp[] = [
  {
    name:
      'Accounting',

    description:
      'Financial records and reporting',

    icon:
      Calculator,
  },

  {
    name:
      'Invoicing',

    description:
      'Invoices, payments and customers',

    icon:
      Receipt,
  },

  {
    name:
      'CRM',

    description:
      'Leads and customer relationships',

    icon:
      Users,
  },

  {
    name:
      'Sales',

    description:
      'Sales activity and orders',

    icon:
      ShoppingCart,
  },

  {
    name:
      'Inventory',

    description:
      'Products and stock movement',

    icon:
      Package,
  },

  {
    name:
      'Manufacturing',

    description:
      'Production and operations',

    icon:
      Building2,
  },

  {
    name:
      'Employees',

    description:
      'People and workforce operations',

    icon:
      BriefcaseBusiness,
  },

  {
    name:
      'Projects',

    description:
      'Projects, tasks and delivery',

    icon:
      FileText,
  },

  {
    name:
      'Helpdesk',

    description:
      'Customer support and requests',

    icon:
      Headphones,
  },
];

/* ============================================================
   FEATURE CARD
   ============================================================ */

function FeatureCard({
  feature,
}: {
  feature: Feature;
}) {
  const Icon =
    feature.icon;

  return (
    <article className="group relative overflow-hidden bg-white p-7 transition duration-300 hover:bg-slate-50 sm:p-9">

      <div className="flex items-start justify-between gap-4">

        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition duration-300 group-hover:bg-blue-600 group-hover:text-white">
          <Icon className="h-5 w-5" />
        </div>

        <span className="text-[11px] font-black tracking-[0.16em] text-slate-300">
          {feature.number}
        </span>
      </div>

      <h3 className="mt-7 max-w-sm text-xl font-black tracking-[-0.025em] text-slate-950">
        {feature.title}
      </h3>

      <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">
        {feature.description}
      </p>

      <div className="mt-7 flex items-center gap-2 text-xs font-bold text-slate-400 transition group-hover:text-blue-600">
        <span>
          Built into the SaMi platform
        </span>

        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </div>
    </article>
  );
}

/* ============================================================
   BUSINESS APP CARD
   ============================================================ */

function BusinessAppCard({
  app,
}: {
  app: BusinessApp;
}) {
  const Icon =
    app.icon;

  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition duration-300 hover:border-blue-400/30 hover:bg-white/[0.08]">

      <div className="flex items-start gap-3">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-300 transition group-hover:bg-blue-500 group-hover:text-white">
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="min-w-0">

          <p className="text-sm font-bold text-white">
            {app.name}
          </p>

          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            {app.description}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FEATURES
   ============================================================ */

export default function Features() {
  return (
    <section
      id="features"
      className="relative overflow-hidden border-t border-slate-100 bg-slate-50 py-24 sm:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-blue-100/50 blur-[120px]"
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">

        {/* ====================================================
            INTRO
            ==================================================== */}

        <div className="grid gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-end">

          <div className="max-w-4xl">

            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-bold text-blue-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />

              One connected business workspace
            </div>

            <h2 className="mt-6 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[58px] lg:leading-[1.04]">

              Run your business from

              <span className="block text-blue-600">
                one intelligent workspace.
              </span>
            </h2>

            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              SaMi brings together your business applications,
              people, information and AI so your team can work
              from one platform while each part of the business
              remains properly organized.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">
              The SaMi workspace
            </p>

            <div className="mt-4 space-y-3">

              {[
                'One account for every user',
                'One workspace for each business',
                'Apps added as the business needs them',
                'SaMi AI across the workspace',
              ].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item
                    }
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />

                    <span className="text-sm font-medium leading-6 text-slate-600">
                      {item}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ====================================================
            FEATURE GRID
            ==================================================== */}

        <div className="mt-16 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-200 shadow-sm">

          <div className="grid gap-px md:grid-cols-2 lg:grid-cols-3">
            {features.map(
              (
                feature
              ) => (
                <FeatureCard
                  key={
                    feature.number
                  }
                  feature={
                    feature
                  }
                />
              )
            )}
          </div>
        </div>

        {/* ====================================================
            WORKSPACE MODEL
            ==================================================== */}

        <div className="mt-20">

          <div className="mx-auto max-w-3xl text-center">

            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">
              How SaMi is organized
            </p>

            <h3 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">
              One platform. Different parts of your business.
            </h3>

            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              Your SaMi account gives you access to the platform.
              Your workspace represents your business. Business
              apps then handle specific areas of your operations.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">

            {/* ACCOUNT */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <User className="h-5 w-5" />
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Level 01
              </p>

              <h4 className="mt-2 text-lg font-black text-slate-950">
                Your SaMi account
              </h4>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                Your personal identity, security,
                preferences and access to the businesses
                you belong to.
              </p>
            </div>

            {/* WORKSPACE */}

            <div className="rounded-3xl border border-blue-200 bg-blue-600 p-6 text-white shadow-xl shadow-blue-600/10">

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <Building2 className="h-5 w-5" />
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                Level 02
              </p>

              <h4 className="mt-2 text-lg font-black">
                Business workspace
              </h4>

              <p className="mt-3 text-sm leading-7 text-blue-100">
                The central home for your business,
                team access, applications, activity,
                automation and SaMi AI.
              </p>
            </div>

            {/* APPS */}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <AppWindow className="h-5 w-5" />
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Level 03
              </p>

              <h4 className="mt-2 text-lg font-black text-slate-950">
                Business applications
              </h4>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                Dedicated apps handle areas such as
                invoicing, sales, inventory, projects
                and other business operations.
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            APP ECOSYSTEM
            ==================================================== */}

        <div className="relative mt-20 overflow-hidden rounded-[32px] bg-slate-950 px-6 py-8 text-white shadow-2xl sm:px-10 sm:py-12 lg:px-12">

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl"
          />

          <div className="relative grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">

            <div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">

                <AppWindow className="h-3.5 w-3.5 text-blue-400" />

                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-300">
                  SaMi app ecosystem
                </span>
              </div>

              <h3 className="mt-5 max-w-xl text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                Choose the tools your business actually needs.
              </h3>

              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
                Your workspace does not need to become crowded
                with tools you never use. Start with the business
                apps that matter today and install more when your
                operations require them.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">

                <Link
                  href="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  Build your workspace

                  <ArrowRight className="h-4 w-4" />
                </Link>

                <a
                  href="#features"
                  className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Explore SaMi
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">

              {businessApps.map(
                (
                  app
                ) => (
                  <BusinessAppCard
                    key={
                      app.name
                    }
                    app={
                      app
                    }
                  />
                )
              )}
            </div>
          </div>

          <div className="relative mt-10 border-t border-white/10 pt-6">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                  <Sparkles className="h-4 w-4" />
                </div>

                <div>

                  <p className="text-xs font-black text-white">
                    SaMi AI is part of the platform itself.
                  </p>

                  <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
                    It is not another installed business app.
                    Apps can securely provide relevant context
                    and capabilities to SaMi AI when permitted.
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-violet-300">
                Core workspace
              </span>
            </div>
          </div>
        </div>

        {/* ====================================================
            DASHBOARD DIRECTION
            ==================================================== */}

        <div className="mt-20 rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">

          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">

            <div>

              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">
                Your business home
              </p>

              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">
                A dashboard built around what needs your attention.
              </h3>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                Your SaMi dashboard should bring together the
                most useful information from your workspace
                without trying to replace the applications
                themselves.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">

              {[
                {
                  title:
                    'Your work',

                  text:
                    'Tasks, activities and items that need attention.',
                },

                {
                  title:
                    'Business activity',

                  text:
                    'Useful signals from the apps installed in your workspace.',
                },

                {
                  title:
                    'SaMi AI',

                  text:
                    'Ask questions and work with permitted business context.',
                },

                {
                  title:
                    'Quick actions',

                  text:
                    'Jump directly into the business actions you use most.',
                },
              ].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item.title
                    }
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-black text-slate-950">
                      {item.title}
                    </p>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {item.text}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}