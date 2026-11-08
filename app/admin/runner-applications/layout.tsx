import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { authenticateAdmin } from "@/apps/admin/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminRunnerApplicationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await authenticateAdmin();

  if (auth.response || !auth.user) {
    redirect("/admin/login");
  }

  return children;
}