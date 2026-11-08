
import { NextRequest } from "next/server";

import { changeAdminPassword } from "@/apps/admin/server/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return changeAdminPassword(request);
}
