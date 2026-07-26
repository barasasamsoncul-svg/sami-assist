"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BusinessOnboardingPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function createSlug(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const businessSlug =
        createSlug(businessName);

      const response = await fetch(
        "/api/business/provision",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName,
            businessSlug,
            email,
            phone,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(
          data.error ||
            "Business setup failed."
        );
        setLoading(false);
        return;
      }

      alert(
        "Business created successfully!"
      );

      router.push("/dashboard");
    } catch (error) {
      console.error(
        "Business provisioning error:",
        error
      );

      setError(
        "Something went wrong. Please try again."
      );

      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Set Up Your Business
          </h1>

          <p className="mt-2 text-gray-500">
            Create your workspace in SaMi Assist
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Business Name
            </label>

            <input
              type="text"
              required
              value={businessName}
              onChange={(e) =>
                setBusinessName(e.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="SaMi Technologies"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Business Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="business@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Business Phone
            </label>

            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="+254..."
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-100 p-3 text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading
              ? "Setting Up Business..."
              : "Create Business"}
          </button>
        </form>

      </div>
    </main>
  );
}