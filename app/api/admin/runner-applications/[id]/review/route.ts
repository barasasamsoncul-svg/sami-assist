import { NextRequest } from "next/server";

import { reviewRunnerApplication } from "@/apps/admin/server/runner-application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params;

  return reviewRunnerApplication(request, id);
}