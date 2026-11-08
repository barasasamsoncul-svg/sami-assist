
import { redirect } from "next/navigation";

import AdminDashboard from "@/apps/admin/features/dashboard/AdminDashboard";
import { authenticateAdmin } from "@/apps/admin/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await authenticateAdmin(
    new Request("http://localhost/admin"),
  );

  if (auth.response || !auth.user) {
    redirect("/admin/login");
  }

  return <AdminDashboard user={auth.user} />;
}
