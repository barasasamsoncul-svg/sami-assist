import { NextRequest } from "next/server";

import {
  listAdminSessions,
  revokeOtherAdminSessions,
} from "@/apps/admin/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return listAdminSessions(request);
}

export async function DELETE(request: NextRequest) {
  return revokeOtherAdminSessions(request);
}