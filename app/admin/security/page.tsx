import Link from "next/link";
import { redirect } from "next/navigation";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import AdminSecurityForm from "@/apps/admin/features/auth/AdminSecurityForm";

export const dynamic = "force-dynamic";

export default async function AdminSecurityRoute() {
  const auth = await authenticateAdmin();

  if (auth.response || !auth.user) {
    redirect("/admin/login");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
        >
          ← Back to Admin
        </Link>

        <div className="mb-8 mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Security settings
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Manage your Admin credentials and current session.
          </p>
        </div>

        <AdminSecurityForm />
      </div>
    </main>
  );
}