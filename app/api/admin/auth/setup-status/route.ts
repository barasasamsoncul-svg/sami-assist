
import { getAdminSetupStatus } from "@/apps/admin/server/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getAdminSetupStatus();
}
