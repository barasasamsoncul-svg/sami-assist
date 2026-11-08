import { redirect } from "next/navigation";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import RunnerApplicationsPage from "@/apps/admin/features/runner-applications/RunnerApplicationsPage";

export const dynamic = "force-dynamic";

export default async function AdminRunnerApplicationsRoute() {
  const admin = await authenticateAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return <RunnerApplicationsPage />;
}