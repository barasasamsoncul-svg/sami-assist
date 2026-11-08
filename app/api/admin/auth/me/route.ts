
import { NextRequest } from "next/server";
import { getAdminSession } from "@/apps/admin/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return getAdminSession(request);
}

