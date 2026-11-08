import { NextRequest } from "next/server";

import { reviewRunnerDocument } from "@/apps/admin/server/runner-application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    documentId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { id, documentId } = await params;

  return reviewRunnerDocument(request, id, documentId);
}