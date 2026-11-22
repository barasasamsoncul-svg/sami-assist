import { redirect } from "next/navigation";

import AdminErrandsPage from "@/apps/admin/features/errands/AdminErrandsPage";
import { authenticateAdmin } from "@/apps/admin/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminErrandsRoute() {
  const auth = await authenticateAdmin();

  if (auth.response || !auth.user) {
    redirect("/admin/login");
  }

  return <AdminErrandsPage adminName={auth.user.full_name} />;
}
