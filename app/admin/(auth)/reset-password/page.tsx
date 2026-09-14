'use client';

import {
  FormEvent,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Link from 'next/link';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

type ResetPasswordResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  next?:
    string;
};

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminResetPasswordPage() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const token =
    useMemo(
      () =>
        searchParams
          .get('token')
          ?.trim() ||
        '',
      [
        searchParams,
      ]
    );

  const [
    newPassword,
    setNewPassword,
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
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

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
    completed,
    setCompleted,
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
      loading ||
      completed
    ) {
      return;
    }

    setError(
      null
    );

    if (
      !token
    ) {
      setError(
        'This password reset link is invalid or incomplete.'
      );

      return;
    }

    if (
      newPassword.length <
        12
    ) {
      setError(
        'Administrator passwords must contain at least 12 characters.'
      );

      return;
    }

    if (
      !/[A-Z]/.test(
        newPassword
      ) ||
      !/[a-z]/.test(
        newPassword
      ) ||
      !/[0-9]/.test(
        newPassword
      ) ||
      !/[^A-Za-z0-9]/.test(
        newPassword
      ) ||
      /\s/.test(
        newPassword
      )
    ) {
      setError(
        'Use uppercase, lowercase, a number and a symbol, with no spaces.'
      );

      return;
    }

    if (
      newPassword !==
        confirmPassword
    ) {
      setError(
        'The passwords do not match.'
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/reset-password',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                token,

                newPassword,

                confirmPassword,
              }),
          }
        );

      const data =
        (
          await response.json()
        ) as
          ResetPasswordResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
          data.message ||
          'Your password could not be reset.'
        );

        return;
      }

      setCompleted(
        true
      );

      /*
       * Give the user an explicit success state rather than
       * immediately disappearing from the page.
       */
      window.setTimeout(
        () => {
          router.replace(
            data.next ||
              '/admin/login?reason=password_reset'
          );
        },
        1800
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Reset Password]',
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

          <p
            className="
              mt-1
              text-xs
              font-medium
              uppercase
              tracking-[0.18em]
              text-zinc-500
            "
          >
            Platform Administration
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
          {completed ? (
            <div
              className="
                text-center
              "
            >
              <div
                className="
                  mx-auto
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

              <h1
                className="
                  mt-5
                  text-2xl
                  font-semibold
                "
              >
                Password updated
              </h1>

              <p
                className="
                  mt-3
                  text-sm
                  leading-6
                  text-zinc-400
                "
              >
                Your administrator password has been changed
                successfully. All administrator sessions have
                been revoked.
              </p>

              <p
                className="
                  mt-4
                  text-xs
                  text-zinc-500
                "
              >
                Redirecting you to secure sign in…
              </p>
            </div>
          ) : (
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
                  Account recovery
                </p>

                <h1
                  className="
                    mt-2
                    text-2xl
                    font-semibold
                  "
                >
                  Create a new password
                </h1>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-6
                    text-zinc-400
                  "
                >
                  Choose a strong password for your authorized
                  SaMi platform administrator account.
                </p>
              </div>

              {!token && (
                <div
                  className="
                    mt-6
                    flex
                    gap-3
                    rounded-xl
                    border
                    border-amber-500/20
                    bg-amber-500/10
                    px-4
                    py-3
                    text-sm
                    text-amber-200
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
                    This reset link is missing its secure token.
                    Request a new password reset link.
                  </span>
                </div>
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
                  mt-7
                  space-y-5
                "
              >
                {/* NEW PASSWORD */}

                <div>
                  <label
                    htmlFor="admin-new-password"
                    className="
                      mb-2
                      block
                      text-sm
                      font-medium
                      text-zinc-300
                    "
                  >
                    New password
                  </label>

                  <div
                    className="
                      relative
                    "
                  >
                    <LockKeyhole
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
                      id="admin-new-password"
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="new-password"
                      value={
                        newPassword
                      }
                      onChange={(
                        event
                      ) =>
                        setNewPassword(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        loading ||
                        !token
                      }
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-white/10
                        bg-black/20
                        pl-12
                        pr-12
                        text-sm
                        outline-none
                        transition
                        placeholder:text-zinc-600
                        focus:border-white/25
                        focus:ring-4
                        focus:ring-white/[0.04]
                        disabled:opacity-50
                      "
                      placeholder="New administrator password"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (
                            current
                          ) =>
                            !current
                        )
                      }
                      className="
                        absolute
                        right-3
                        top-1/2
                        -translate-y-1/2
                        rounded-lg
                        p-2
                        text-zinc-500
                        transition
                        hover:bg-white/[0.05]
                        hover:text-white
                      "
                      aria-label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    >
                      {showPassword ? (
                        <EyeOff
                          className="
                            h-4
                            w-4
                          "
                        />
                      ) : (
                        <Eye
                          className="
                            h-4
                            w-4
                          "
                        />
                      )}
                    </button>
                  </div>
                </div>

                {/* CONFIRM */}

                <div>
                  <label
                    htmlFor="admin-confirm-password"
                    className="
                      mb-2
                      block
                      text-sm
                      font-medium
                      text-zinc-300
                    "
                  >
                    Confirm password
                  </label>

                  <div
                    className="
                      relative
                    "
                  >
                    <LockKeyhole
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
                      id="admin-confirm-password"
                      type={
                        showConfirmPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="new-password"
                      value={
                        confirmPassword
                      }
                      onChange={(
                        event
                      ) =>
                        setConfirmPassword(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        loading ||
                        !token
                      }
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-white/10
                        bg-black/20
                        pl-12
                        pr-12
                        text-sm
                        outline-none
                        transition
                        placeholder:text-zinc-600
                        focus:border-white/25
                        focus:ring-4
                        focus:ring-white/[0.04]
                        disabled:opacity-50
                      "
                      placeholder="Confirm new password"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          (
                            current
                          ) =>
                            !current
                        )
                      }
                      className="
                        absolute
                        right-3
                        top-1/2
                        -translate-y-1/2
                        rounded-lg
                        p-2
                        text-zinc-500
                        transition
                        hover:bg-white/[0.05]
                        hover:text-white
                      "
                      aria-label={
                        showConfirmPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff
                          className="
                            h-4
                            w-4
                          "
                        />
                      ) : (
                        <Eye
                          className="
                            h-4
                            w-4
                          "
                        />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className="
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
                      font-medium
                      text-zinc-300
                    "
                  >
                    Administrator password requirements
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      leading-5
                      text-zinc-500
                    "
                  >
                    At least 12 characters with uppercase,
                    lowercase, number and symbol. Spaces are not
                    allowed.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={
                    loading ||
                    !token
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
                    transition
                    hover:bg-zinc-200
                    disabled:cursor-not-allowed
                    disabled:opacity-50
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

                      Updating password…
                    </>
                  ) : (
                    'Reset password'
                  )}
                </button>
              </form>

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
      </section>
    </main>
  );
}