'use client';

import {
  FormEvent,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

/* ============================================================
   TYPES
   ============================================================ */

type LoginResponse = {
  success?:
    boolean;

  authenticated?:
    boolean;

  requiresTwoFactor?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  next?:
    string;

  lockedUntil?:
    string;

  challengeExpiresAt?:
    string;

  admin?: {
    id?: string;

    email?: string;

    fullName?: string;

    role?: string;
  };
};

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminLoginPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    rememberMe,
    setRememberMe,
  ] =
    useState(false);

  const [
    showPassword,
    setShowPassword,
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
      !normalizedEmail ||
      !password
    ) {
      setError(
        'Enter your administrator email and password.'
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
          '/api/admin/auth/login',
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
                email:
                  normalizedEmail,

                password,

                rememberMe,
              }),
          }
        );

      const data =
        (await response.json()) as
          LoginResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
            data.message ||
            'Administrator sign-in failed.'
        );

        return;
      }

      if (
        data.requiresTwoFactor
      ) {
        /*
         * Email is cosmetic only.
         *
         * No token, password, recovery code or authentication
         * credential is placed in browser storage.
         */
        sessionStorage.setItem(
          'sami_admin_login_email',
          normalizedEmail
        );

        router.replace(
          data.next ||
            '/admin/two-factor'
        );

        return;
      }

      if (
        data.authenticated
      ) {
        sessionStorage.removeItem(
          'sami_admin_login_email'
        );

        router.replace(
          data.next ||
            '/admin'
        );

        router.refresh();

        return;
      }

      setError(
        'Administrator authentication did not complete.'
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Login]',
        error
      );

      setError(
        'SaMi could not connect to the administrator authentication service.'
      );
    } finally {
      setLoading(
        false
      );
    }
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
            top-[-20rem]
            h-[40rem]
            w-[40rem]
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
              shadow-2xl
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
              tracking-tight
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
            Secure platform administration
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
              mb-7
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.16em]
                text-zinc-500
              "
            >
              Administrator access
            </p>

            <h2
              className="
                mt-2
                text-2xl
                font-semibold
              "
            >
              Sign in
            </h2>

            <p
              className="
                mt-2
                text-sm
                leading-6
                text-zinc-400
              "
            >
              Sign in using an authorized SaMi platform
              administrator account.
            </p>
          </div>

          {error && (
            <div
              className="
                mb-6
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
              space-y-5
            "
          >
            <div>
              <label
                htmlFor="admin-email"
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
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  value={email}
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
                    outline-none
                    transition
                    placeholder:text-zinc-600
                    focus:border-white/25
                    focus:ring-4
                    focus:ring-white/[0.04]
                  "
                  placeholder="Administrator email"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="
                  mb-2
                  block
                  text-sm
                  font-medium
                  text-zinc-300
                "
              >
                Password
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
                  id="admin-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="current-password"
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    loading
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
                  "
                  placeholder="Password"
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

            <label
              className="
                flex
                cursor-pointer
                items-center
                gap-3
                text-sm
                text-zinc-400
              "
            >
              <input
                type="checkbox"
                checked={
                  rememberMe
                }
                onChange={(
                  event
                ) =>
                  setRememberMe(
                    event.target
                      .checked
                  )
                }
                disabled={
                  loading
                }
                className="
                  h-4
                  w-4
                  accent-white
                "
              />

              Keep this administrator session active
            </label>

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
                  Continue

                  <ArrowRight
                    className="
                      h-4
                      w-4
                    "
                  />
                </>
              )}
            </button>
          </form>

          <div
            className="
              mt-7
              border-t
              border-white/10
              pt-5
            "
          >
            <p
              className="
                text-xs
                leading-5
                text-zinc-500
              "
            >
              Restricted to authorized SaMi platform
              administrators. Administrative authentication and
              security activity is audited.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}