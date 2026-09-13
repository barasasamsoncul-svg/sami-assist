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
  AlertCircle,
  ArrowLeft,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

type VerifyResponse = {
  success?: boolean;

  authenticated?: boolean;

  code?: string;

  error?: string;

  message?: string;

  next?: string;
};

export default function AdminTwoFactorPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    code,
    setCode,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  /* ==========================================================
     DISPLAY CONTEXT
     ========================================================== */

  useEffect(() => {
    const storedEmail =
      sessionStorage.getItem(
        'sami_admin_login_email'
      );

    if (
      storedEmail
    ) {
      setEmail(
        storedEmail
      );
    }
  }, []);

  const maskedEmail =
    useMemo(
      () => {
        if (
          !email.includes(
            '@'
          )
        ) {
          return '';
        }

        const [
          local,
          domain,
        ] =
          email.split(
            '@'
          );

        return (
          local.slice(
            0,
            2
          ) +
          '*'.repeat(
            Math.max(
              2,
              local.length -
                2
            )
          ) +
          '@' +
          domain
        );
      },
      [
        email,
      ]
    );

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    const cleanCode =
      code.trim();

    if (
      !cleanCode
    ) {
      setError(
        'Enter your authenticator or recovery code.'
      );

      return;
    }

    setLoading(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/two-factor/verify',
          {
            method:
              'POST',

            credentials:
              'include',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code:
                  cleanCode,
              }),
          }
        );

      const data =
        (await response.json()) as
          VerifyResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
            data.message ||
            'Administrator verification failed.'
        );

        return;
      }

      if (
        !data.authenticated
      ) {
        setError(
          'Administrator authentication did not complete.'
        );

        return;
      }

      sessionStorage.removeItem(
        'sami_admin_login_email'
      );

      router.replace(
        data.next ||
          '/admin'
      );

      router.refresh();
    } catch (
      error
    ) {
      console.error(
        '[Admin 2FA]',
        error
      );

      setError(
        'SaMi could not connect to the administrator verification service.'
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  function returnToLogin() {
    sessionStorage.removeItem(
      'sami_admin_login_email'
    );

    router.replace(
      '/admin/login'
    );
  }

  return (
    <main
      className="
        relative
        flex
        min-h-screen
        items-center
        justify-center
        overflow-hidden
        bg-zinc-950
        px-4
        py-10
        text-white
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
        "
      >
        <div
          className="
            absolute
            left-1/2
            top-[-18rem]
            h-[36rem]
            w-[36rem]
            -translate-x-1/2
            rounded-full
            bg-white/[0.04]
            blur-3xl
          "
        />

        <div
          className="
            absolute
            inset-0
            bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)]
            bg-[size:48px_48px]
            [mask-image:linear-gradient(to_bottom,black,transparent)]
          "
        />
      </div>

      <section
        className="
          relative
          z-10
          w-full
          max-w-md
        "
      >
        <header
          className="
            mb-8
            text-center
          "
        >
          <div
            className="
              mx-auto
              flex
              h-14
              w-14
              items-center
              justify-center
              rounded-2xl
              bg-white
              text-zinc-950
            "
          >
            <ShieldCheck
              className="
                h-7
                w-7
              "
            />
          </div>

          <h1
            className="
              mt-5
              text-xl
              font-semibold
            "
          >
            SaMi Admin
          </h1>

          <p
            className="
              mt-2
              text-sm
              text-zinc-400
            "
          >
            Verify your administrator identity
          </p>
        </header>

        <div
          className="
            rounded-3xl
            border
            border-white/10
            bg-white/[0.055]
            p-6
            shadow-2xl
            shadow-black/30
            backdrop-blur-xl
            sm:p-8
          "
        >
          <div
            className="
              flex
              h-11
              w-11
              items-center
              justify-center
              rounded-xl
              bg-white/[0.07]
            "
          >
            <KeyRound
              className="
                h-5
                w-5
              "
            />
          </div>

          <h2
            className="
              mt-5
              text-2xl
              font-semibold
            "
          >
            Two-factor authentication
          </h2>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-zinc-400
            "
          >
            Enter the 6-digit code from your authenticator
            app. You can also use one of your SaMi Admin
            recovery codes.
          </p>

          {maskedEmail && (
            <p
              className="
                mt-3
                text-xs
                text-zinc-500
              "
            >
              Administrator: {maskedEmail}
            </p>
          )}

          {error && (
            <div
              className="
                mt-6
                flex
                gap-3
                rounded-xl
                border
                border-red-500/20
                bg-red-500/10
                px-4
                py-3
                text-sm
                text-red-200
              "
            >
              <AlertCircle
                className="
                  mt-0.5
                  h-5
                  w-5
                  shrink-0
                "
              />

              <span>
                {error}
              </span>
            </div>
          )}

          <form
            onSubmit={
              handleSubmit
            }
            className="
              mt-6
            "
          >
            <label
              htmlFor="admin-two-factor-code"
              className="
                mb-2
                block
                text-sm
                font-medium
                text-zinc-300
              "
            >
              Verification code
            </label>

            <input
              id="admin-two-factor-code"
              value={
                code
              }
              onChange={(
                event
              ) =>
                setCode(
                  event.target
                    .value
                )
              }
              autoComplete="one-time-code"
              autoFocus
              disabled={
                loading
              }
              maxLength={
                128
              }
              placeholder="Authenticator or recovery code"
              className="
                h-14
                w-full
                rounded-xl
                border
                border-white/10
                bg-black/20
                px-4
                text-center
                text-lg
                font-semibold
                tracking-[0.15em]
                outline-none
                transition
                placeholder:text-sm
                placeholder:font-normal
                placeholder:tracking-normal
                placeholder:text-zinc-600
                focus:border-white/25
                focus:ring-4
                focus:ring-white/[0.04]
              "
            />

            <button
              type="submit"
              disabled={
                loading ||
                !code.trim()
              }
              className="
                mt-5
                flex
                h-12
                w-full
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-white
                text-sm
                font-semibold
                text-zinc-950
                transition
                hover:bg-zinc-200
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              {loading ? (
                <>
                  <Loader2
                    className="
                      h-4
                      w-4
                      animate-spin
                    "
                  />

                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck
                    className="
                      h-4
                      w-4
                    "
                  />

                  Verify and continue
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={
              returnToLogin
            }
            disabled={
              loading
            }
            className="
              mt-4
              flex
              h-11
              w-full
              items-center
              justify-center
              gap-2
              rounded-xl
              text-sm
              text-zinc-400
              transition
              hover:bg-white/[0.05]
              hover:text-white
            "
          >
            <ArrowLeft
              className="
                h-4
                w-4
              "
            />

            Back to sign in
          </button>
        </div>
      </section>
    </main>
  );
}