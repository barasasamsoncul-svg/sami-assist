'use client';

import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Link from 'next/link';

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};

type CompleteIdentityResponse = {
  success?: boolean;

  code?: string;

  error?: string;

  message?: string;

  next?: string;

  retryAfterSeconds?: number;

  admin?: {
    id?: string;

    email?: string;

    firstName?: string;

    lastName?: string;

    fullName?: string;

    role?: string;

    status?: string;

    emailVerified?: boolean;

    twoFactorRequired?: boolean;

    twoFactorEnabled?: boolean;
  };
};

type PasswordRequirements = {
  length: boolean;

  uppercase: boolean;

  lowercase: boolean;

  number: boolean;

  symbol: boolean;

  noWhitespace: boolean;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MIN_PASSWORD_LENGTH =
  12;

const MAX_PASSWORD_LENGTH =
  128;

/* ============================================================
   PASSWORD
   ============================================================ */

function evaluatePassword(
  password: string
): PasswordRequirements {
  return {
    length:
      password.length >=
        MIN_PASSWORD_LENGTH &&
      password.length <=
        MAX_PASSWORD_LENGTH,

    uppercase:
      /[A-Z]/.test(
        password
      ),

    lowercase:
      /[a-z]/.test(
        password
      ),

    number:
      /[0-9]/.test(
        password
      ),

    symbol:
      /[^A-Za-z0-9\s]/.test(
        password
      ),

    noWhitespace:
      !/\s/.test(
        password
      ),
  };
}

function isPasswordValid(
  requirements: PasswordRequirements
): boolean {
  return Object
    .values(
      requirements
    )
    .every(
      Boolean
    );
}

/* ============================================================
   TOKEN
   ============================================================ */

function cleanSetupTokenFromUrl() {
  try {
    const url =
      new URL(
        window.location.href
      );

    if (
      !url.searchParams.has(
        'token'
      )
    ) {
      return;
    }

    url.searchParams.delete(
      'token'
    );

    const replacement =
      `${url.pathname}${url.search}${url.hash}`;

    window.history.replaceState(
      window.history.state,
      '',
      replacement
    );
  } catch {
    /*
     * URL cleanup is defense-in-depth.
     *
     * Failure to clean the address bar must not destroy the
     * setup credential held in memory.
     */
  }
}

/* ============================================================
   REQUIREMENT
   ============================================================ */

function Requirement({
  met,
  children,
}: {
  met: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        'flex items-center gap-2 text-xs font-medium transition',
        met
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-500 dark:text-slate-400',
      ].join(
        ' '
      )}
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
          met
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500',
        ].join(
          ' '
        )}
      >
        {met ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </span>

      <span>
        {children}
      </span>
    </div>
  );
}

/* ============================================================
   CONTENT
   ============================================================ */

function AdminCompleteIdentityContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  /*
   * CRITICAL:
   *
   * Once captured, the token must NEVER be replaced by the
   * cleaned URL's empty query parameter.
   *
   * The old page captured the token, removed it from the URL,
   * then could run the effect again and set setupToken = ''.
   */
  const tokenCapturedRef =
    useRef(
      false
    );

  const [
    setupToken,
    setSetupToken,
  ] =
    useState('');

  const [
    tokenReady,
    setTokenReady,
  ] =
    useState(
      false
    );

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false
    );

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(
      false
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  const [
    completed,
    setCompleted,
  ] =
    useState(
      false
    );

  const [
    fieldError,
    setFieldError,
  ] =
    useState('');

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,
      type: 'error',
      title: '',
      message: '',
    });

  /* ==========================================================
     PASSWORD STATE
     ========================================================== */

  const passwordRequirements =
    useMemo(
      () =>
        evaluatePassword(
          password
        ),
      [
        password,
      ]
    );

  const passwordValid =
    isPasswordValid(
      passwordRequirements
    );

  const passwordsMatch =
    Boolean(
      password &&
      confirmPassword &&
      password ===
        confirmPassword
    );

  /* ==========================================================
     CAPTURE SETUP TOKEN ONCE
     ========================================================== */

  useEffect(
    () => {
      /*
       * Important:
       *
       * useSearchParams can change when the address bar is
       * cleaned. Never process it twice.
       */
      if (
        tokenCapturedRef.current
      ) {
        return;
      }

      tokenCapturedRef.current =
        true;

      const token =
        searchParams
          .get(
            'token'
          )
          ?.trim() ||
        '';

      /*
       * First put the credential into React memory.
       */
      setSetupToken(
        token
      );

      setTokenReady(
        true
      );

      /*
       * Only after capturing it do we remove it from the visible
       * browser URL.
       */
      if (
        token
      ) {
        cleanSetupTokenFromUrl();
      }
    },
    [
      searchParams,
    ]
  );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  function showOverlay(
    type: SaMiOverlayType,
    title: string,
    message: string
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
    });
  }

  function closeOverlay() {
    if (
      completed
    ) {
      router.replace(
        '/admin/login?reason=account_ready'
      );

      return;
    }

    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting ||
      completed
    ) {
      return;
    }

    setFieldError('');

    if (
      !setupToken
    ) {
      showOverlay(
        'error',
        'Setup link unavailable',
        'This administrator setup credential is missing, expired, or has already been used.'
      );

      return;
    }

    if (
      !password
    ) {
      setFieldError(
        'Enter your new administrator password.'
      );

      return;
    }

    if (
      !passwordValid
    ) {
      setFieldError(
        'Your password does not yet meet all administrator security requirements.'
      );

      return;
    }

    if (
      !confirmPassword
    ) {
      setFieldError(
        'Confirm your new administrator password.'
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setFieldError(
        'The passwords do not match.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/complete-identity',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            cache:
              'no-store',

            credentials:
              'same-origin',

            body:
              JSON.stringify({
                token:
                  setupToken,

                password,

                confirmPassword,
              }),
          }
        );

      let data:
        CompleteIdentityResponse;

      try {
        data =
          await response.json();
      } catch {
        data = {
          success: false,

          code:
            'INVALID_SERVER_RESPONSE',

          error:
            'SaMi returned an invalid response.',
        };
      }

      /* ======================================================
         SUCCESS
         ====================================================== */

      if (
        response.ok &&
        data.success
      ) {
        /*
         * Destroy the setup credential from memory immediately
         * after successful server-side consumption.
         */
        setSetupToken('');

        setPassword('');

        setConfirmPassword('');

        setCompleted(
          true
        );

        showOverlay(
          'success',
          'Administrator account ready',
          'Your Platform Administrator identity is now active. Sign in with your new password to continue with the required security setup.'
        );

        return;
      }

      /* ======================================================
         RATE LIMIT
         ====================================================== */

      if (
        response.status ===
          429 ||
        data.code ===
          'SETUP_RATE_LIMITED'
      ) {
        const retryAfter =
          Math.max(
            1,
            Number(
              data.retryAfterSeconds ||
                response.headers.get(
                  'Retry-After'
                ) ||
                60
            )
          );

        showOverlay(
          'warning',
          'Too many attempts',
          `Administrator setup has been temporarily limited. Try again in about ${retryAfter} seconds.`
        );

        return;
      }

      /* ======================================================
         PASSWORD
         ====================================================== */

      if (
        data.code ===
          'INVALID_PASSWORD'
      ) {
        setFieldError(
          data.error ||
            'Your password does not meet the administrator security requirements.'
        );

        return;
      }

      if (
        data.code ===
          'PASSWORD_MISMATCH'
      ) {
        setFieldError(
          'The passwords do not match.'
        );

        return;
      }

      /* ======================================================
         TOKEN
         ====================================================== */

      if (
        data.code ===
          'SETUP_TOKEN_INVALID' ||
        data.code ===
          'INVALID_TOKEN'
      ) {
        setSetupToken('');

        showOverlay(
          'error',
          'Setup link expired',
          'This administrator setup credential is invalid, expired, or has already been used. Verify your administrator email again to receive a fresh setup credential.'
        );

        return;
      }

      /* ======================================================
         SERVICE
         ====================================================== */

      if (
        response.status ===
          503 ||
        data.code ===
          'SERVICE_TEMPORARILY_UNAVAILABLE'
      ) {
        showOverlay(
          'warning',
          'SaMi is temporarily unavailable',
          'Your administrator setup could not be completed right now. Your setup credential may still be valid, so retry before starting verification again.'
        );

        return;
      }

      showOverlay(
        'error',
        'Setup could not be completed',
        data.error ||
          'SaMi could not complete your administrator account setup.'
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Complete Identity] Request failed:',
        error instanceof
          Error
          ? error.message
          : 'Unknown client request error'
      );

      showOverlay(
        'error',
        'Connection problem',
        'SaMi could not reach the authentication service. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     LOADING TOKEN
     ========================================================== */

  if (
    !tokenReady
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-500" />

          <p className="mt-4 text-sm text-slate-500">
            Preparing administrator setup…
          </p>
        </div>
      </main>
    );
  }

  /* ==========================================================
     MISSING TOKEN
     ========================================================== */

  if (
    !setupToken &&
    !completed
  ) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center">
          <div className="w-full rounded-[30px] border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-9">
            <SaMiLogo
              size="md"
              showTagline
              showBackground={false}
            />

            <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <KeyRound className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-2xl font-black">
              Setup link unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              This administrator setup link is missing, expired, or has already been used.
            </p>

            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              If you just verified your email before this page was fixed, return to email verification and submit the same verification code again. SaMi can recognize the already-consumed valid verification and issue a new one-time setup credential.
            </p>

            <Link
              href="/admin/verify-email"
              className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Return to email verification
            </Link>

            <Link
              href="/admin/login"
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-bold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Administrator sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* ==========================================================
     MAIN
     ========================================================== */

  return (
    <>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
          <div className="grid w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20 lg:grid-cols-[0.9fr_1.1fr]">

            {/* BRAND PANEL */}

            <section className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-950 p-10 text-white dark:border-slate-800 lg:flex lg:flex-col lg:justify-between">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)]"
              />

              <div className="relative z-10">
                <SaMiLogo
                  size="lg"
                  showTagline
                  showBackground={false}
                />

                <div className="mt-16 max-w-md">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <ShieldCheck className="h-7 w-7 text-blue-300" />
                  </div>

                  <h1 className="mt-6 text-3xl font-black tracking-tight">
                    Secure your Platform Administrator identity
                  </h1>

                  <p className="mt-4 text-sm leading-7 text-slate-400">
                    Your email ownership has been confirmed. Create the password that will protect your SaMi Platform Administrator identity.
                  </p>
                </div>

                <div className="mt-10 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex gap-3">
                      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />

                      <div>
                        <div className="text-sm font-bold">
                          Strong administrator credentials
                        </div>

                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          Platform Administrator passwords use stricter requirements than standard workspace accounts.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex gap-3">
                      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-purple-300" />

                      <div>
                        <div className="text-sm font-bold">
                          One-time setup
                        </div>

                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          This setup credential expires and can only activate your administrator identity once.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="relative z-10 mt-12 text-xs text-slate-600">
                SaMi — AI Powered Business Workspace
              </p>
            </section>

            {/* FORM */}

            <section className="p-6 sm:p-10 lg:p-12">
              <div className="mx-auto max-w-lg">

                <div className="lg:hidden">
                  <SaMiLogo
                    size="md"
                    showTagline
                    showBackground={false}
                  />
                </div>

                <div className="mt-8 lg:mt-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5" />

                    Platform Administrator
                  </div>

                  <h2 className="mt-5 text-3xl font-black tracking-tight">
                    Complete your account
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Create your administrator password. After this step, you will sign in normally and continue with the required security setup.
                  </p>
                </div>

                <form
                  onSubmit={
                    handleSubmit
                  }
                  className="mt-8 space-y-6"
                >

                  {/* PASSWORD */}

                  <div>
                    <label
                      htmlFor="admin-password"
                      className="text-sm font-bold"
                    >
                      Administrator password
                    </label>

                    <div className="relative mt-2">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <input
                        id="admin-password"
                        type={
                          showPassword
                            ? 'text'
                            : 'password'
                        }
                        value={
                          password
                        }
                        onChange={
                          event => {
                            setPassword(
                              event.target.value
                            );

                            setFieldError('');
                          }
                        }
                        autoComplete="new-password"
                        maxLength={
                          MAX_PASSWORD_LENGTH
                        }
                        disabled={
                          submitting ||
                          completed
                        }
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm outline-none transition focus:border-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(
                            current =>
                              !current
                          )
                        }
                        aria-label={
                          showPassword
                            ? 'Hide password'
                            : 'Show password'
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* REQUIREMENTS */}

                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-950/50">
                    <Requirement
                      met={
                        passwordRequirements.length
                      }
                    >
                      12–128 characters
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements.uppercase
                      }
                    >
                      Uppercase letter
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements.lowercase
                      }
                    >
                      Lowercase letter
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements.number
                      }
                    >
                      Number
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements.symbol
                      }
                    >
                      Symbol
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements.noWhitespace
                      }
                    >
                      No spaces
                    </Requirement>
                  </div>

                  {/* CONFIRM */}

                  <div>
                    <label
                      htmlFor="admin-confirm-password"
                      className="text-sm font-bold"
                    >
                      Confirm administrator password
                    </label>

                    <div className="relative mt-2">
                      <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <input
                        id="admin-confirm-password"
                        type={
                          showConfirmPassword
                            ? 'text'
                            : 'password'
                        }
                        value={
                          confirmPassword
                        }
                        onChange={
                          event => {
                            setConfirmPassword(
                              event.target.value
                            );

                            setFieldError('');
                          }
                        }
                        autoComplete="new-password"
                        maxLength={
                          MAX_PASSWORD_LENGTH
                        }
                        disabled={
                          submitting ||
                          completed
                        }
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm outline-none transition focus:border-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(
                            current =>
                              !current
                          )
                        }
                        aria-label={
                          showConfirmPassword
                            ? 'Hide password confirmation'
                            : 'Show password confirmation'
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {confirmPassword && (
                      <p
                        className={[
                          'mt-2 text-xs font-semibold',
                          passwordsMatch
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400',
                        ].join(
                          ' '
                        )}
                      >
                        {passwordsMatch
                          ? 'Passwords match.'
                          : 'Passwords do not match.'}
                      </p>
                    )}
                  </div>

                  {/* FIELD ERROR */}

                  {fieldError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    >
                      {fieldError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      completed ||
                      !passwordValid ||
                      !passwordsMatch
                    }
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />

                        Activating administrator…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />

                        Activate Administrator Account
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-6 text-center text-xs leading-5 text-slate-500">
                  This setup credential is one-time use. SaMi never stores it in plaintext.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SaMiOverlay
        open={
          overlay.open
        }
        type={
          overlay.type
        }
        title={
          overlay.title
        }
        message={
          overlay.message
        }
        onClose={
          closeOverlay
        }
      />
    </>
  );
}

/* ============================================================
   SUSPENSE FALLBACK
   ============================================================ */

function CompleteIdentityFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="text-center">
        <SaMiLogo
          size="md"
          showTagline
          showBackground={false}
        />

        <Loader2 className="mx-auto mt-8 h-7 w-7 animate-spin text-slate-500" />

        <p className="mt-4 text-sm text-slate-500">
          Preparing administrator setup…
        </p>
      </div>
    </main>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminCompleteIdentityPage() {
  return (
    <Suspense
      fallback={
        <CompleteIdentityFallback />
      }
    >
      <AdminCompleteIdentityContent />
    </Suspense>
  );
}