import { listRunnerApplications } from "@/apps/admin/server/runner-applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return listRunnerApplications(request);
}