import { redirect } from "next/navigation";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import RunnerApplicationsPage from "@/apps/admin/features/runner-applications/RunnerApplicationsPage";

export const dynamic = "force-dynamic";

export default async function AdminRunnerApplicationsRoute() {
  const auth = await authenticateAdmin();

  if (auth.response || !auth.user) {
    redirect("/admin/login");
  }

  return <RunnerApplicationsPage />;
}