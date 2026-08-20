"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    setRegistered(
      searchParams.get("registered") === "true"
    );
  }, [searchParams]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Invalid email or password."
        );
      }

      /*
       * The server has now established the authenticated
       * session.
       *
       * We don't need to store the business or database
       * credentials in localStorage.
       */
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to sign in."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
              <Sparkles className="h-7 w-7" />
            </div>

            <h1 className="mt-6 text-3xl font-bold tracking-tight">
              Welcome back
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in to your SaMi business workspace.
            </p>
          </div>

          {/* Registration success */}
          {registered && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
              <strong>Account created successfully.</strong>{" "}
              Sign in to access your business workspace.
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
            >
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-5"
          >
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold"
              >
                Email
              </label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-semibold"
                >
                  Password
                </label>

                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Your password"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Register */}
          <div className="mt-7 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500">
              Don't have a SaMi account?
            </p>

            <Link
              href="/auth/register"
              className="mt-2 inline-block font-semibold text-blue-600 hover:underline"
            >
              Create your workspace
            </Link>
          </div>

          {/* Security note */}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center text-xs leading-5 text-slate-500">
            Your business data is isolated in your dedicated
            SaMi tenant workspace.
          </div>
        </section>
      </div>
    </main>
  );
}