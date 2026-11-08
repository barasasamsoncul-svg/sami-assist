
import { NextRequest } from "next/server";
import { logoutAdmin } from "@/apps/admin/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return logoutAdmin(request);
}
