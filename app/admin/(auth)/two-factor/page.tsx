'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type Method =
  | 'authenticator'
  | 'email'
  | 'recovery';

type ChallengeResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;

  methods?: {
    authenticator: boolean;
    email: boolean;
    recovery: boolean;
  };

  email?: string | null;

  emailCodeSent?: boolean;
  retryAfterSeconds?: number;
};

type VerifyResponse = {
  success?: boolean;
  authenticated?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
};

type OverlayState = {
  open: boolean;
  type:
    | 'success'
    | 'error'
    | 'warning'
    | 'info';
  title: string;
  message: string;
};

async function readPayload<T>(
  response: Response
): Promise<T> {
  try {
    return await response.json();
  } catch {
    return {} as T;
  }
}

function maskEmail(
  value: string
) {
  const normalized =
    value.trim();

  const at =
    normalized.indexOf('@');

  if (at <= 0) {
    return normalized;
  }

  const local =
    normalized.slice(
      0,
      at
    );

  const domain =
    normalized.slice(
      at + 1
    );

  const visible =
    local.slice(
      0,
      Math.min(
        2,
        local.length
      )
    );

  return (
    `${visible}${'*'.repeat(
      Math.max(
        3,
        local.length -
          visible.length
      )
    )}@${domain}`
  );
}

export default function AdminTwoFactorPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    method,
    setMethod,
  ] =
    useState<Method>(
      'authenticator'
    );

  const [
    methods,
    setMethods,
  ] =
    useState({
      authenticator:
        false,
      email: false,
      recovery: false,
    });

  const [
    code,
    setCode,
  ] =
    useState('');

  const [
    loadingState,
    setLoadingState,
  ] =
    useState(true);

  const [
    verifying,
    setVerifying,
  ] =
    useState(false);

  const [
    sendingEmail,
    setSendingEmail,
  ] =
    useState(false);

  const [
    emailCodeSent,
    setEmailCodeSent,
  ] =
    useState(false);

  const [
    fieldError,
    setFieldError,
  ] =
    useState<
      string | null
    >(null);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,
      type: 'info',
      title: '',
      message: '',
    });

  const maskedEmail =
    useMemo(
      () =>
        email
          ? maskEmail(
              email
            )
          : '',
      [email]
    );

  function showOverlay(
    type:
      OverlayState['type'],
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
    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

  function returnToLogin() {
    sessionStorage.removeItem(
      'sami_admin_login_email'
    );

    router.replace(
      '/admin/login'
    );
  }

  useEffect(
    () => {
      const storedEmail =
        sessionStorage.getItem(
          'sami_admin_login_email'
        );

      if (storedEmail) {
        setEmail(
          storedEmail
        );
      }

      void loadChallenge();
    },
    []
  );

  async function loadChallenge() {
    setLoadingState(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/two-factor/verify',
          {
            method: 'GET',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const payload =
        await readPayload<ChallengeResponse>(
          response
        );

      if (
        !response.ok ||
        !payload.success ||
        !payload.methods
      ) {
        if (
          response.status ===
          401
        ) {
          showOverlay(
            'warning',
            'Sign-in expired',
            payload.error ||
              'Your administrator sign-in challenge has expired. Sign in again.'
          );

          return;
        }

        throw new Error(
          payload.error ||
            'SaMi could not load your verification methods.'
        );
      }

      setMethods(
        payload.methods
      );

      if (
        payload.email
      ) {
        setEmail(
          payload.email
        );
      }

      if (
        payload.methods
          .authenticator
      ) {
        setMethod(
          'authenticator'
        );
      } else if (
        payload.methods.email
      ) {
        setMethod(
          'email'
        );
      } else {
        setMethod(
          'recovery'
        );
      }
    } catch (error) {
      showOverlay(
        'error',
        'Verification unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load administrator verification.'
      );
    } finally {
      setLoadingState(
        false
      );
    }
  }

  function selectMethod(
    nextMethod: Method
  ) {
    if (
      nextMethod ===
        'authenticator' &&
      !methods.authenticator
    ) {
      return;
    }

    if (
      nextMethod ===
        'email' &&
      !methods.email
    ) {
      return;
    }

    if (
      nextMethod ===
        'recovery' &&
      !methods.recovery
    ) {
      return;
    }

    setMethod(
      nextMethod
    );

    setCode('');
    setFieldError(null);
  }

  async function sendEmailCode() {
    if (
      sendingEmail
    ) {
      return;
    }

    setSendingEmail(
      true
    );

    setFieldError(null);

    try {
      const response =
        await fetch(
          '/api/admin/auth/two-factor/verify',
          {
            method: 'POST',
            credentials:
              'same-origin',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'send_email',
              }),
          }
        );

      const payload =
        await readPayload<ChallengeResponse>(
          response
        );

      if (
        !response.ok ||
        !payload.success
      ) {
        if (
          response.status ===
          401
        ) {
          showOverlay(
            'warning',
            'Sign-in expired',
            payload.error ||
              'Your administrator sign-in challenge has expired. Sign in again.'
          );

          return;
        }

        throw new Error(
          payload.error ||
            'SaMi could not send your security code.'
        );
      }

      setEmailCodeSent(
        true
      );

      setCode('');

      showOverlay(
        'success',
        'Security code sent',
        maskedEmail
          ? `A 6-digit security code has been sent to ${maskedEmail}.`
          : 'A 6-digit security code has been sent to your administrator email.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Code not sent',
        error instanceof Error
          ? error.message
          : 'SaMi could not send your security code.'
      );
    } finally {
      setSendingEmail(
        false
      );
    }
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (verifying) {
      return;
    }

    const cleanCode =
      code
        .replace(
          /\s+/g,
          ''
        )
        .trim();

    setFieldError(
      null
    );

    if (
      method ===
        'email' &&
      !emailCodeSent
    ) {
      setFieldError(
        'Send a security code to your email first.'
      );

      return;
    }

    if (
      method ===
        'authenticator' ||
      method ===
        'email'
    ) {
      if (
        !/^\d{6}$/.test(
          cleanCode
        )
      ) {
        setFieldError(
          'Enter the 6-digit verification code.'
        );

        return;
      }
    } else if (
      !cleanCode
    ) {
      setFieldError(
        'Enter one of your recovery codes.'
      );

      return;
    }

    setVerifying(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/two-factor/verify',
          {
            method: 'POST',
            credentials:
              'same-origin',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'verify',
                method,
                code:
                  cleanCode,
              }),
          }
        );

      const payload =
        await readPayload<VerifyResponse>(
          response
        );

      if (
        !response.ok ||
        !payload.success ||
        !payload.authenticated
      ) {
        if (
          response.status ===
          401 &&
          (
            payload.code ===
              'LOGIN_CHALLENGE_INVALID' ||
            payload.code ===
              'LOGIN_CHALLENGE_EXPIRED'
          )
        ) {
          showOverlay(
            'warning',
            'Sign-in expired',
            payload.error ||
              'Your administrator sign-in challenge has expired. Sign in again.'
          );

          return;
        }

        setFieldError(
          payload.error ||
            payload.message ||
            'The verification code is incorrect or has expired.'
        );

        return;
      }

      sessionStorage.removeItem(
        'sami_admin_login_email'
      );

      router.replace(
        payload.next ||
          '/admin'
      );

      router.refresh();
    } catch {
      showOverlay(
        'error',
        'Verification failed',
        'SaMi could not connect to the administrator verification service.'
      );
    } finally {
      setVerifying(
        false
      );
    }
  }

  const busy =
    verifying ||
    sendingEmail;

  const methodTitle =
    method ===
    'authenticator'
      ? 'Authenticator app'
      : method ===
          'email'
        ? 'Email verification'
        : 'Recovery code';

  const methodDescription =
    method ===
    'authenticator'
      ? 'Enter the 6-digit code currently shown in your authenticator app.'
      : method ===
          'email'
        ? emailCodeSent
          ? `Enter the 6-digit security code sent to ${maskedEmail || 'your administrator email'}.`
          : `Send a security code to ${maskedEmail || 'your administrator email'} to continue.`
        : 'Enter one of the recovery codes you saved when two-factor authentication was configured.';

  return (
    <>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl" />

          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>

        <section className="relative z-10 w-full max-w-lg">
          <header className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-950">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <h1 className="mt-5 text-xl font-semibold">
              SaMi Admin
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Verify your administrator identity
            </p>
          </header>

          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            {loadingState ? (
              <div className="flex min-h-80 items-center justify-center">
                <div className="text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-400" />

                  <p className="mt-4 text-sm font-medium text-zinc-400">
                    Loading verification methods
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.07]">
                  <KeyRound className="h-5 w-5" />
                </div>

                <h2 className="mt-5 text-2xl font-semibold">
                  Two-factor authentication
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose one of your available verification methods to continue.
                </p>

                {maskedEmail && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Administrator: {maskedEmail}
                  </p>
                )}

                <div className="mt-6 grid gap-3">
                  {methods.authenticator && (
                    <MethodButton
                      active={
                        method ===
                        'authenticator'
                      }
                      icon={
                        <Smartphone className="h-5 w-5" />
                      }
                      title="Authenticator app"
                      description="Use a 6-digit code from your authenticator app."
                      onClick={() =>
                        selectMethod(
                          'authenticator'
                        )
                      }
                    />
                  )}

                  {methods.email && (
                    <MethodButton
                      active={
                        method ===
                        'email'
                      }
                      icon={
                        <Mail className="h-5 w-5" />
                      }
                      title="Email verification"
                      description={
                        maskedEmail
                          ? `Send a security code to ${maskedEmail}.`
                          : 'Send a security code to your administrator email.'
                      }
                      onClick={() =>
                        selectMethod(
                          'email'
                        )
                      }
                    />
                  )}

                  {methods.recovery && (
                    <MethodButton
                      active={
                        method ===
                        'recovery'
                      }
                      icon={
                        <KeyRound className="h-5 w-5" />
                      }
                      title="Recovery code"
                      description="Use one of your saved recovery codes."
                      onClick={() =>
                        selectMethod(
                          'recovery'
                        )
                      }
                    />
                  )}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-5">
                  <div className="flex items-center gap-3">
                    {method ===
                    'authenticator' ? (
                      <Smartphone className="h-5 w-5 text-zinc-300" />
                    ) : method ===
                      'email' ? (
                      <Mail className="h-5 w-5 text-zinc-300" />
                    ) : (
                      <KeyRound className="h-5 w-5 text-zinc-300" />
                    )}

                    <p className="font-semibold">
                      {methodTitle}
                    </p>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {methodDescription}
                  </p>

                  {method ===
                    'email' && (
                    <button
                      type="button"
                      disabled={
                        busy
                      }
                      onClick={() =>
                        void sendEmailCode()
                      }
                      className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : emailCodeSent ? (
                        <RefreshCw className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}

                      {sendingEmail
                        ? 'Sending code'
                        : emailCodeSent
                          ? 'Send another code'
                          : 'Send security code'}
                    </button>
                  )}

                  <form
                    onSubmit={
                      handleSubmit
                    }
                    className="mt-5"
                  >
                    <label
                      htmlFor="admin-two-factor-code"
                      className="mb-2 block text-sm font-medium text-zinc-300"
                    >
                      {method ===
                      'recovery'
                        ? 'Recovery code'
                        : 'Verification code'}
                    </label>

                    <input
                      id="admin-two-factor-code"
                      value={
                        code
                      }
                      onChange={event => {
                        setFieldError(
                          null
                        );

                        if (
                          method ===
                          'recovery'
                        ) {
                          setCode(
                            event.target
                              .value
                              .slice(
                                0,
                                128
                              )
                          );

                          return;
                        }

                        setCode(
                          event.target
                            .value
                            .replace(
                              /\D/g,
                              ''
                            )
                            .slice(
                              0,
                              6
                            )
                        );
                      }}
                      autoComplete="one-time-code"
                      autoFocus={
                        method !==
                        'email' ||
                        emailCodeSent
                      }
                      disabled={
                        busy ||
                        (
                          method ===
                            'email' &&
                          !emailCodeSent
                        )
                      }
                      inputMode={
                        method ===
                        'recovery'
                          ? 'text'
                          : 'numeric'
                      }
                      maxLength={
                        method ===
                        'recovery'
                          ? 128
                          : 6
                      }
                      placeholder={
                        method ===
                        'recovery'
                          ? 'XXXX-XXXX-XXXX-XXXX'
                          : '000000'
                      }
                      className={`h-14 w-full rounded-xl border bg-black/20 px-4 text-center font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        fieldError
                          ? 'border-red-500/50 focus:border-red-400 focus:ring-4 focus:ring-red-500/10'
                          : 'border-white/10 focus:border-white/25 focus:ring-4 focus:ring-white/[0.04]'
                      } ${
                        method ===
                        'recovery'
                          ? 'font-mono text-base tracking-[0.08em]'
                          : 'font-mono text-xl tracking-[0.3em]'
                      }`}
                    />

                    {fieldError && (
                      <p className="mt-2 text-sm font-medium text-red-300">
                        {fieldError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={
                        verifying ||
                        !code.trim() ||
                        (
                          method ===
                            'email' &&
                          !emailCodeSent
                        )
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {verifying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verifying
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Verify and continue
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <button
                  type="button"
                  onClick={
                    returnToLogin
                  }
                  disabled={
                    busy
                  }
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </section>
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
        primaryAction={
          overlay.title ===
            'Sign-in expired'
            ? {
                label:
                  'Back to sign in',
                onClick:
                  returnToLogin,
              }
            : undefined
        }
      />
    </>
  );
}

function MethodButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-white/30 bg-white/[0.1]'
          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.06]'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active
            ? 'bg-white text-zinc-950'
            : 'bg-white/[0.07] text-zinc-300'
        }`}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {title}
        </span>

        <span className="mt-1 block text-xs leading-5 text-zinc-400">
          {description}
        </span>
      </span>

      {active && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}