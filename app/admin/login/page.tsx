
import { redirect } from "next/navigation";

import AdminLoginForm from "@/apps/admin/features/auth/AdminLoginForm";
import { authenticateAdmin } from "@/apps/admin/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const auth = await authenticateAdmin();

  if (auth.user) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}
