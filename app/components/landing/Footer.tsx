import Link from 'next/link';

import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ExternalLink,
  Mail,
  ShieldCheck,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   FOOTER
   ============================================================ */

export default function Footer() {
  const year =
    new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-slate-200 bg-white">

      {/* ======================================================
          BACKGROUND
          ====================================================== */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[360px] w-[850px] -translate-x-1/2 translate-y-1/2 rounded-full bg-blue-100/60 blur-[120px]"
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">

        {/* ====================================================
            FINAL CTA
            ==================================================== */}

        <div className="py-16 sm:py-20">

          <div className="relative overflow-hidden rounded-[32px] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-12 lg:px-14">

            {/* DECORATION */}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl"
            />

            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">

              {/* TEXT */}

              <div className="max-w-3xl">

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
                  <Building2 className="h-3.5 w-3.5 text-blue-400" />

                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-300">
                    Build your SaMi workspace
                  </span>
                </div>

                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  Bring your business into one connected workspace.
                </h2>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                  Create your account, set up your business workspace
                  and choose the applications your team actually needs.
                </p>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">

                  {[
                    'Start with the apps you need',
                    'Invite your team',
                    'Expand as your business grows',
                  ].map(
                    (
                      item
                    ) => (
                      <div
                        key={
                          item
                        }
                        className="flex items-center gap-2 text-xs font-semibold text-slate-300"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />

                        {item}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* ACTION */}

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">

                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  Start building

                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================
            MAIN FOOTER
            ==================================================== */}

        <div className="border-t border-slate-200 py-14">

          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr]">

            {/* ==================================================
                BRAND
                ================================================== */}

            <div>

              <Link
                href="/"
                aria-label="SaMi home"
                className="inline-block"
              >
                <SaMiLogo
                  size="md"
                  className="max-w-full"
                />
              </Link>

              <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">
                SaMi brings your business applications, people,
                information and intelligent tools into one connected
                workspace.
              </p>

              <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <Bot className="h-4 w-4 text-violet-600" />

                <div>
                  <p className="text-[10px] font-black text-slate-900">
                    SaMi AI
                  </p>

                  <p className="text-[9px] text-slate-500">
                    Built into the core workspace
                  </p>
                </div>
              </div>
            </div>

            {/* ==================================================
                PRODUCT
                ================================================== */}

            <div>

              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-950">
                Product
              </h3>

              <ul className="mt-5 space-y-3.5 text-sm text-slate-600">

                <li>
                  <Link
                    href="/#features"
                    className="transition hover:text-blue-600"
                  >
                    Features
                  </Link>
                </li>

                <li>
                  <Link
                    href="/#pricing"
                    className="transition hover:text-blue-600"
                  >
                    Pricing
                  </Link>
                </li>

                <li>
                  <Link
                    href="/register"
                    className="transition hover:text-blue-600"
                  >
                    Create account
                  </Link>
                </li>

                <li>
                  <Link
                    href="/login"
                    className="transition hover:text-blue-600"
                  >
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>

            {/* ==================================================
                PLATFORM
                ================================================== */}

            <div>

              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-950">
                Platform
              </h3>

              <ul className="mt-5 space-y-3.5 text-sm text-slate-600">

                <li>
                  <Link
                    href="/#features"
                    className="transition hover:text-blue-600"
                  >
                    Business apps
                  </Link>
                </li>

                <li>
                  <Link
                    href="/#features"
                    className="transition hover:text-blue-600"
                  >
                    SaMi AI
                  </Link>
                </li>

                <li>
                  <Link
                    href="/#features"
                    className="transition hover:text-blue-600"
                  >
                    Workspaces
                  </Link>
                </li>

                <li>
                  <Link
                    href="/#features"
                    className="transition hover:text-blue-600"
                  >
                    Teams
                  </Link>
                </li>
              </ul>
            </div>

            {/* ==================================================
                COMPANY
                ================================================== */}

            <div>

              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-950">
                SaMi Technologies
              </h3>

              <ul className="mt-5 space-y-3.5 text-sm text-slate-600">

                <li>
                  <Link
                    href="/#about"
                    className="transition hover:text-blue-600"
                  >
                    About SaMi
                  </Link>
                </li>

                <li>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                    <span className="text-xs leading-5 text-slate-500">
                      Security and access are managed at both
                      account and workspace level.
                    </span>
                  </div>
                </li>

                <li>
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                    <span className="text-xs leading-5 text-slate-500">
                      Contact details will be published with the
                      official SaMi support channel.
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* ====================================================
            BOTTOM
            ==================================================== */}

        <div className="border-t border-slate-200 py-7">

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="text-xs font-semibold text-slate-600">
                © {year} SaMi Technologies.
                All rights reserved.
              </p>

              <p className="mt-1 text-[10px] text-slate-400">
                Building connected business software for modern teams.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">

              <Link
                href="/"
                className="text-[11px] font-bold text-slate-500 transition hover:text-blue-600"
              >
                Home
              </Link>

              <Link
                href="/#features"
                className="text-[11px] font-bold text-slate-500 transition hover:text-blue-600"
              >
                Product
              </Link>

              <Link
                href="/#pricing"
                className="text-[11px] font-bold text-slate-500 transition hover:text-blue-600"
              >
                Pricing
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 transition hover:text-blue-600"
              >
                Open SaMi

                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}