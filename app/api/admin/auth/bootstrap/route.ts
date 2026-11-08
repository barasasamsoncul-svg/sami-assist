
import { NextRequest } from "next/server";

import { bootstrapAdmin } from "@/apps/admin/server/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return bootstrapAdmin(request);
}
