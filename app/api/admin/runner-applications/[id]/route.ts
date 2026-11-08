
import { NextRequest } from "next/server";

import { getRunnerApplicationDetail } from "@/apps/admin/server/runner-application-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params;

  return getRunnerApplicationDetail(request, id);
}
