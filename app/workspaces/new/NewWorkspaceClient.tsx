'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  useRouter,
} from 'next/navigation';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiTheme,
} from '@/app/components/useSaMiTheme';


const CONTINUATION_KEY =
  'sami_workspace_create_draft';

const LEGACY_ACCOUNT_KEY =
  'sami_account_form';

const APPS_STORAGE_KEY =
  'sami_selected_apps';

const PLAN_STORAGE_KEY =
  'sami_selected_plan';

const VERIFICATION_EMAIL_KEY =
  'sami_verification_email';


type Props = {
  account: {
    email: string;
    firstName: string;
    lastName: string;
  };
};


type OverlayState = {
  type:
    | 'error'
    | 'warning'
    | 'success'
    | 'info';

  title: string;
  message: string;

  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };

  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
};


function cleanBusinessName(
  value:
    string,
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      ' ',
    )
    .slice(
      0,
      120,
    );
}


export default function NewWorkspaceClient({
  account,
}: Props) {
  const router =
    useRouter();

  const {
    darkMode,
    toggleTheme,
  } =
    useSaMiTheme();

  const [
    businessName,
    setBusinessName,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState<
      OverlayState | null
    >(
      null,
    );


  useEffect(() => {
    void fetch(
      '/api/auth/registration-draft',
      {
        method:
          'DELETE',
        credentials:
          'same-origin',
        cache:
          'no-store',
      },
    ).catch(
      () =>
        undefined,
    );

    try {
      /*
       * A public registration attempt may leave a safe
       * "business name + email" continuation before sign-in.
       * Use it only when it belongs to this exact signed-in
       * account. It contains no password or auth token.
       */
      const raw =
        sessionStorage.getItem(
          CONTINUATION_KEY,
        );

      if (
        raw
      ) {
        const parsed =
          JSON.parse(
            raw,
          ) as {
            email?:
              unknown;
            businessName?:
              unknown;
          };

        const email =
          typeof parsed.email ===
            'string'
            ? parsed.email
                .trim()
                .toLowerCase()
            : '';

        if (
          email ===
            account.email
              .trim()
              .toLowerCase() &&
          typeof parsed
            .businessName ===
            'string'
        ) {
          setBusinessName(
            cleanBusinessName(
              parsed
                .businessName,
            ),
          );
        }
      }

      /*
       * Never carry registration identity, old app choices or
       * verification state into a new workspace flow.
       */
      sessionStorage.removeItem(
        LEGACY_ACCOUNT_KEY,
      );

      sessionStorage.removeItem(
        APPS_STORAGE_KEY,
      );

      sessionStorage.removeItem(
        PLAN_STORAGE_KEY,
      );

      sessionStorage.removeItem(
        VERIFICATION_EMAIL_KEY,
      );
    } catch {
      // The server remains authoritative even if storage is unavailable.
    }
  }, [
    account.email,
  ]);


  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    setOverlay(
      null,
    );

    const name =
      cleanBusinessName(
        businessName,
      );

    if (
      name.length <
        2
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Workspace name required',

        message:
          'Enter the business or organization name for the new SaMi workspace.',
      });

      return;
    }

    setLoading(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/auth/registration-draft',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                source:
                  'existing',

                businessName:
                  name,
              }),
          },
        );

      let data:
        {
          success?:
            boolean;
          code?:
            string;
          error?:
            string;
        } =
        {};

      try {
        data =
          await response.json();
      } catch {
        data =
          {};
      }

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          response.status ===
            401
        ) {
          router.replace(
            '/login?next=%2Fworkspaces%2Fnew',
          );

          router.refresh();

          return;
        }

        throw new Error(
          data.error ||
          'SaMi could not prepare the new workspace.',
        );
      }

      try {
        sessionStorage.removeItem(
          CONTINUATION_KEY,
        );

        sessionStorage.removeItem(
          APPS_STORAGE_KEY,
        );

        sessionStorage.removeItem(
          PLAN_STORAGE_KEY,
        );
      } catch {
        // Server draft remains authoritative.
      }

      router.push(
        '/select-apps',
      );
    } catch (
      error
    ) {
      setOverlay({
        type:
          'error',

        title:
          'Workspace setup could not start',

        message:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not prepare the new workspace.',
      });
    } finally {
      setLoading(
        false,
      );
    }
  }


  const displayName =
    [
      account.firstName,
      account.lastName,
    ]
      .filter(
        Boolean,
      )
      .join(
        ' ',
      )
      .trim() ||
    'SaMi user';


  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={
            overlay.type
          }
          title={
            overlay.title
          }
          message={
            overlay.message
          }
          primaryAction={
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={() =>
            setOverlay(
              null,
            )
          }
        />
      )}

      <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-blue-500/[0.07] blur-[110px] dark:bg-blue-500/[0.10]" />
          <div className="absolute -bottom-52 right-[-150px] h-[620px] w-[620px] rounded-full bg-indigo-500/[0.07] blur-[120px] dark:bg-indigo-500/[0.10]" />
        </div>

        <button
          type="button"
          onClick={
            toggleTheme
          }
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="relative mx-auto grid min-h-screen w-full max-w-[1400px] items-center gap-8 px-4 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-12">
          <section className="hidden lg:block">
            <Link
              href="/dashboard"
              aria-label="SaMi workspace"
              className="inline-block"
            >
              <SaMiLogo
                size="xl"
              />
            </Link>

            <div className="mt-10 max-w-[470px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50/70 px-3 py-1.5 text-xs font-bold text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300">
                <Building2 className="h-3.5 w-3.5" />
                Multi-workspace identity
              </div>

              <h1 className="mt-5 text-[40px] font-black leading-[1.08] tracking-[-0.045em]">
                One SaMi account.
                <br />
                Multiple workspaces.
              </h1>

              <p className="mt-5 text-sm leading-7 text-slate-500 dark:text-slate-400">
                Create another organization without creating another login. Your account security, 2FA and personal identity remain the same while each workspace keeps its own members, apps, data and subscription.
              </p>

              <div className="mt-7 space-y-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Separate workspace data and permissions
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Independent apps and subscription
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Same verified SaMi identity
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-[620px]">
            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8 dark:border-white/10 dark:bg-[#11151d]/90">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to workspace
              </Link>

              <div className="mt-7">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                  Create workspace
                </p>

                <h2 className="mt-2 text-2xl font-black tracking-[-0.035em]">
                  Start another business workspace
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  This workspace will be owned by your current SaMi account. You do not need another password.
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm dark:bg-white/[0.06] dark:text-slate-200">
                    <UserRound className="h-[18px] w-[18px]" />
                  </span>

                  <div className="min-w-0">
                    <p className="text-xs font-black">
                      {displayName}
                    </p>

                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {account.email}
                      </span>
                    </div>
                  </div>

                  <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Signed in
                  </span>
                </div>
              </div>

              <form
                onSubmit={
                  submit
                }
                className="mt-6"
              >
                <label className="block text-[11px] font-black text-slate-700 dark:text-slate-200">
                  Business or workspace name
                </label>

                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.03]">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />

                  <input
                    value={
                      businessName
                    }
                    onChange={
                      event =>
                        setBusinessName(
                          event.target
                            .value
                            .slice(
                              0,
                              120,
                            ),
                        )
                    }
                    autoComplete="organization"
                    placeholder="e.g. SaMi Technologies"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                  />
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-3 text-[11px] leading-5 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Your account identity stays global. Business members, roles, apps, companies, files and billing remain isolated inside the new workspace.
                </div>

                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}

                  Continue to apps
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
