'use client';

import {
  FormEvent,
  useState,
} from 'react';

import Link from 'next/link';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

type ForgotPasswordResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;
};

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminForgotPasswordPage() {
  const [
    email,
    setEmail,
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

  const [
    submitted,
    setSubmitted,
  ] =
    useState(false);

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

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail
    ) {
      setError(
        'Enter your administrator email address.'
      );

      return;
    }

    setError(
      null
    );

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/forgot-password',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            credentials:
              'same-origin',

            body:
              JSON.stringify({
                email:
                  normalizedEmail,
              }),
          }
        );

      const data =
        (
          await response.json()
        ) as
          ForgotPasswordResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
          data.message ||
          'Password recovery could not be started.'
        );

        return;
      }

      /*
       * Generic success state.
       *
       * We deliberately do not reveal whether the administrator
       * identity exists, is active, or was throttled.
       */
      setSubmitted(
        true
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Forgot Password]',
        error
      );

      setError(
        'SaMi could not connect to the administrator recovery service.'
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

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
      {/* ======================================================
          BACKGROUND
          ====================================================== */}

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
            top-[-20rem]
            h-[40rem]
            w-[40rem]
            -translate-x-1/2
            rounded-full
            bg-blue-600/[0.08]
            blur-3xl
          "
        />

        <div
          className="
            absolute
            bottom-[-18rem]
            right-[-12rem]
            h-[34rem]
            w-[34rem]
            rounded-full
            bg-blue-900/[0.07]
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
        {/* ====================================================
            REAL SAMI BRAND
            ==================================================== */}

        <header
          className="
            mb-7
            flex
            flex-col
            items-center
            text-center
          "
        >
          <SaMiLogo
            size="md"
            showTagline={false}
            showReflection={false}
            showBackground={false}
            className="max-w-[220px]"
          />

          <div
            className="
              mt-1
              inline-flex
              items-center
              rounded-full
              border
              border-white/10
              bg-white/[0.04]
              px-3
              py-1
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.18em]
              text-zinc-400
            "
          >
            Platform Administration
          </div>
        </header>

        {/* ====================================================
            CARD
            ==================================================== */}

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
          {submitted ? (
            /* =================================================
               SUCCESS STATE
               ================================================= */

            <>
              <div
                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-xl
                  bg-emerald-500/10
                  text-emerald-300
                "
              >
                <CheckCircle2
                  className="
                    h-6
                    w-6
                  "
                />
              </div>

              <p
                className="
                  mt-6
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.16em]
                  text-zinc-500
                "
              >
                Recovery request
              </p>

              <h1
                className="
                  mt-2
                  text-2xl
                  font-semibold
                  tracking-tight
                "
              >
                Check your email
              </h1>

              <p
                className="
                  mt-3
                  text-sm
                  leading-6
                  text-zinc-400
                "
              >
                If that administrator account exists and is
                eligible for recovery, SaMi has sent a secure
                password-reset link.
              </p>

              <div
                className="
                  mt-5
                  rounded-xl
                  border
                  border-white/10
                  bg-black/20
                  px-4
                  py-3
                "
              >
                <p
                  className="
                    text-xs
                    leading-5
                    text-zinc-500
                  "
                >
                  For security, SaMi does not confirm whether an
                  administrator email exists.
                </p>
              </div>

              <Link
                href="/admin/login"
                className="
                  mt-7
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
                  shadow-lg
                  shadow-black/20
                  transition
                  hover:bg-zinc-200
                  focus:outline-none
                  focus:ring-4
                  focus:ring-white/10
                "
              >
                <ArrowLeft
                  className="
                    h-4
                    w-4
                  "
                />

                Back to sign in
              </Link>
            </>
          ) : (
            /* =================================================
               REQUEST FORM
               ================================================= */

            <>
              <div>
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.16em]
                    text-zinc-500
                  "
                >
                  Password recovery
                </p>

                <h1
                  className="
                    mt-2
                    text-2xl
                    font-semibold
                    tracking-tight
                  "
                >
                  Forgot your password?
                </h1>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-6
                    text-zinc-400
                  "
                >
                  Enter the email associated with your authorized
                  SaMi platform administrator account.
                </p>
              </div>

              {/* ==============================================
                  ERROR
                  ============================================== */}

              {error && (
                <div
                  role="alert"
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

              {/* ==============================================
                  FORM
                  ============================================== */}

              <form
                onSubmit={
                  handleSubmit
                }
                className="
                  mt-7
                  space-y-5
                "
              >
                <div>
                  <label
                    htmlFor="admin-recovery-email"
                    className="
                      mb-2
                      block
                      text-sm
                      font-medium
                      text-zinc-300
                    "
                  >
                    Administrator email
                  </label>

                  <div
                    className="
                      relative
                    "
                  >
                    <Mail
                      className="
                        absolute
                        left-4
                        top-1/2
                        h-5
                        w-5
                        -translate-y-1/2
                        text-zinc-500
                      "
                    />

                    <input
                      id="admin-recovery-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={
                        email
                      }
                      onChange={(
                        event
                      ) =>
                        setEmail(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        loading
                      }
                      placeholder="Administrator email"
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-white/10
                        bg-black/20
                        pl-12
                        pr-4
                        text-sm
                        text-white
                        outline-none
                        transition
                        placeholder:text-zinc-600
                        focus:border-blue-500/40
                        focus:ring-4
                        focus:ring-blue-500/[0.06]
                        disabled:cursor-not-allowed
                        disabled:opacity-60
                      "
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  className="
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
                    shadow-lg
                    shadow-black/20
                    transition
                    hover:bg-zinc-200
                    focus:outline-none
                    focus:ring-4
                    focus:ring-white/10
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

                      Sending...
                    </>
                  ) : (
                    'Send recovery link'
                  )}
                </button>
              </form>

              {/* ==============================================
                  BACK TO LOGIN
                  ============================================== */}

              <Link
                href="/admin/login"
                className="
                  mt-6
                  flex
                  items-center
                  justify-center
                  gap-2
                  text-sm
                  text-zinc-400
                  transition
                  hover:text-white
                  focus:outline-none
                  focus:ring-2
                  focus:ring-white/10
                "
              >
                <ArrowLeft
                  className="
                    h-4
                    w-4
                  "
                />

                Back to administrator sign in
              </Link>
            </>
          )}
        </div>

        <p
          className="
            mt-5
            text-center
            text-[11px]
            leading-5
            text-zinc-600
          "
        >
          SaMi — AI Powered Business Workspace
        </p>
      </section>
    </main>
  );
}