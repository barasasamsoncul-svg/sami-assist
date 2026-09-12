import Link from 'next/link';

import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';

import Navbar from './components/landing/Navbar';
import Hero from './components/landing/Hero';
import Features from './components/landing/Features';
import Footer from './components/landing/Footer';

/* ============================================================
   PRICING
   ============================================================ */

const plans = [
  {
    key: 'free',
    name: 'Free',
    description:
      'Start building your SaMi workspace and explore the platform before your business needs more capacity.',
    price: 'KSh 0',
    suffix: '/month',
    trial: null,
    featured: false,
    badge: null,
    features: [
      'SaMi business workspace',
      'Personal SaMi account',
      'SaMi AI core workspace',
      'Business app architecture',
      'Team-ready workspace structure',
    ],
  },

  {
    key: 'standard',
    name: 'Standard',
    description:
      'For businesses ready to use SaMi as an everyday workspace for their team and operations.',
    price: 'KSh 2,000',
    suffix: '/user/month',
    trial: 'First month free',
    featured: true,
    badge: 'Most popular',
    features: [
      'Everything needed for a growing workspace',
      'Business applications inside one platform',
      'Team memberships and controlled access',
      'Connected business workflows',
      'SaMi AI across permitted workspace context',
    ],
  },

  {
    key: 'custom',
    name: 'Custom',
    description:
      'For businesses that need a broader SaMi setup as their operations, teams and workflows become more complex.',
    price: 'KSh 3,340',
    suffix: '/user/month',
    trial: 'First month free',
    featured: false,
    badge: 'Advanced',
    features: [
      'Expanded business workspace capabilities',
      'Broader app and workflow requirements',
      'Advanced team and operational structure',
      'SaMi AI across permitted business context',
      'Built for more complex business operations',
    ],
  },
];

/* ============================================================
   HOME
   ============================================================ */

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />

      <main>
        {/* ====================================================
            HERO
            ==================================================== */}

        <Hero />

        {/* ====================================================
            FEATURES
            ==================================================== */}

        <Features />

        {/* ====================================================
            PRICING
            ==================================================== */}

        <section
          id="pricing"
          className="relative overflow-hidden border-t border-slate-100 bg-white py-24 sm:py-32"
        >
          {/* BACKGROUND */}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-blue-50 blur-[120px]"
          />

          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">

            {/* ==================================================
                PRICING INTRO
                ================================================== */}

            <div className="mx-auto max-w-3xl text-center">

              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />

                Simple per-user pricing
              </div>

              <h2 className="mt-6 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Start free.
                <span className="block text-blue-600">
                  Grow when your business grows.
                </span>
              </h2>

              <p className="mt-6 text-base leading-8 text-slate-600 sm:text-lg">
                SaMi pricing grows with the people using your
                workspace. Start on Free, then move to a paid plan
                when your business needs more from the platform.
              </p>
            </div>

            {/* ==================================================
                FIRST MONTH MESSAGE
                ================================================== */}

            <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">

              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
                  <CheckCircle2 className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-sm font-black text-emerald-950">
                    Your first month on a paid plan is free.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    Standard and Custom start at KSh 0 today.
                    Your first subscription charge is due one
                    calendar month after the paid plan begins.
                  </p>
                </div>
              </div>
            </div>

            {/* ==================================================
                PLAN CARDS
                ================================================== */}

            <div className="mx-auto mt-14 grid max-w-7xl gap-5 lg:grid-cols-3">

              {plans.map(
                (
                  plan
                ) => (
                  <article
                    key={
                      plan.key
                    }
                    className={`relative flex flex-col overflow-hidden rounded-[28px] border p-7 sm:p-8 ${
                      plan.featured
                        ? 'border-blue-600 bg-slate-950 text-white shadow-2xl shadow-blue-950/20'
                        : 'border-slate-200 bg-white text-slate-950 shadow-sm'
                    }`}
                  >

                    {/* FEATURED GLOW */}

                    {plan.featured && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-600/30 blur-3xl"
                      />
                    )}

                    <div className="relative flex h-full flex-col">

                      {/* TOP */}

                      <div className="flex items-start justify-between gap-4">

                        <div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                              plan.featured
                                ? 'text-blue-300'
                                : 'text-blue-600'
                            }`}
                          >
                            SaMi plan
                          </p>

                          <h3 className="mt-2 text-2xl font-black">
                            {plan.name}
                          </h3>
                        </div>

                        {plan.badge && (
                          <span
                            className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] ${
                              plan.featured
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {plan.badge}
                          </span>
                        )}
                      </div>

                      {/* DESCRIPTION */}

                      <p
                        className={`mt-4 min-h-[84px] text-sm leading-7 ${
                          plan.featured
                            ? 'text-slate-300'
                            : 'text-slate-600'
                        }`}
                      >
                        {plan.description}
                      </p>

                      {/* PRICE */}

                      <div className="mt-7">

                        <div className="flex flex-wrap items-end gap-x-2 gap-y-1">

                          <span className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                            {plan.price}
                          </span>

                          <span
                            className={`pb-1 text-xs font-semibold ${
                              plan.featured
                                ? 'text-slate-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {plan.suffix}
                          </span>
                        </div>

                        {plan.trial ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black text-emerald-500">
                            <Check className="h-3 w-3" />

                            {plan.trial}
                          </div>
                        ) : (
                          <p className="mt-3 text-[10px] font-semibold text-slate-400">
                            No monthly subscription charge.
                          </p>
                        )}
                      </div>

                      {/* DIVIDER */}

                      <div
                        className={`my-7 h-px ${
                          plan.featured
                            ? 'bg-white/10'
                            : 'bg-slate-100'
                        }`}
                      />

                      {/* FEATURES */}

                      <ul className="space-y-3.5">

                        {plan.features.map(
                          (
                            feature
                          ) => (
                            <li
                              key={
                                feature
                              }
                              className="flex items-start gap-3"
                            >
                              <div
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                  plan.featured
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'bg-emerald-50 text-emerald-600'
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </div>

                              <span
                                className={`text-xs leading-5 ${
                                  plan.featured
                                    ? 'text-slate-300'
                                    : 'text-slate-600'
                                }`}
                              >
                                {feature}
                              </span>
                            </li>
                          )
                        )}
                      </ul>

                      {/* ACTION */}

                      <div className="mt-auto pt-8">

                        <Link
                          href="/register"
                          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black transition ${
                            plan.featured
                              ? 'bg-white text-slate-950 hover:bg-slate-100'
                              : plan.key ===
                                  'custom'
                                ? 'bg-slate-950 text-white hover:bg-slate-800'
                                : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          {plan.key ===
                          'free'
                            ? 'Start free'
                            : 'Start first month free'}

                          <ArrowRight className="h-4 w-4" />
                        </Link>

                        {plan.key !==
                          'free' && (
                          <p
                            className={`mt-3 text-center text-[9px] leading-4 ${
                              plan.featured
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                          >
                            KSh 0 today. Billing begins after your
                            first month.
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>

            {/* ==================================================
                BILLING EXPLANATION
                ================================================== */}

            <div className="mx-auto mt-10 max-w-5xl rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-8">

              <div className="grid gap-7 md:grid-cols-3">

                <div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                    <Users className="h-4 w-4" />
                  </div>

                  <p className="mt-4 text-sm font-black text-slate-950">
                    Per active user
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Paid subscriptions are based on the number
                    of billable users in the workspace.
                  </p>
                </div>

                <div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                    <Building2 className="h-4 w-4" />
                  </div>

                  <p className="mt-4 text-sm font-black text-slate-950">
                    One business workspace
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Your subscription belongs to the business
                    workspace while each person keeps their own
                    SaMi account.
                  </p>
                </div>

                <div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                    <Bot className="h-4 w-4" />
                  </div>

                  <p className="mt-4 text-sm font-black text-slate-950">
                    SaMi AI is core
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    SaMi AI belongs to the platform itself rather
                    than being installed as another business app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            ABOUT
            ==================================================== */}

        <section
          id="about"
          className="relative overflow-hidden border-t border-slate-100 bg-slate-50 py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-8">

            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">

              {/* LEFT */}

              <div>

                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm">
                  <Building2 className="h-3.5 w-3.5" />

                  About SaMi
                </div>

                <h2 className="mt-6 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  One workspace for the way your business actually works.
                </h2>

                <p className="mt-6 max-w-xl text-base leading-8 text-slate-600">
                  SaMi Technologies is building a business
                  platform where applications, people, business
                  information and AI can work together instead of
                  living in separate disconnected systems.
                </p>
              </div>

              {/* RIGHT */}

              <div className="space-y-4">

                {/* ACCOUNT */}

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">

                  <div className="flex items-start gap-4">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <Users className="h-5 w-5" />
                    </div>

                    <div>

                      <p className="text-sm font-black text-slate-950">
                        People have one SaMi identity
                      </p>

                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Every user has their own account,
                        security and preferences, while access
                        to individual businesses is controlled
                        separately through workspace membership.
                      </p>
                    </div>
                  </div>
                </div>

                {/* WORKSPACE */}

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">

                  <div className="flex items-start gap-4">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                      <Building2 className="h-5 w-5" />
                    </div>

                    <div>

                      <p className="text-sm font-black text-slate-950">
                        The workspace represents the business
                      </p>

                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Teams, business applications,
                        permissions, workflows and business
                        activity come together around one
                        workspace.
                      </p>
                    </div>
                  </div>
                </div>

                {/* CONNECTED PLATFORM */}

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">

                  <div className="flex items-start gap-4">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Workflow className="h-5 w-5" />
                    </div>

                    <div>

                      <p className="text-sm font-black text-slate-950">
                        Apps remain specialized but connected
                      </p>

                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Invoicing, CRM, inventory, projects and
                        future business applications can focus
                        on their own jobs while sharing the
                        platform services that connect SaMi.
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI */}

                <div className="rounded-3xl border border-blue-200 bg-blue-600 p-6 text-white shadow-xl shadow-blue-600/10 sm:p-7">

                  <div className="flex items-start gap-4">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                      <Bot className="h-5 w-5" />
                    </div>

                    <div>

                      <p className="text-sm font-black">
                        SaMi AI sits across the workspace
                      </p>

                      <p className="mt-2 text-sm leading-7 text-blue-100">
                        AI can work with permitted business
                        context from across SaMi rather than
                        being isolated inside one application.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ==================================================
                ABOUT CTA
                ================================================== */}

            <div className="mt-16 flex flex-col gap-5 rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-9">

              <div>

                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-600">
                  Build with SaMi
                </p>

                <h3 className="mt-2 text-xl font-black tracking-[-0.025em] text-slate-950">
                  Start with what your business needs today.
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Your workspace can expand as your operations,
                  team and applications grow.
                </p>
              </div>

              <Link
                href="/register"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-700"
              >
                Create your workspace

                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}