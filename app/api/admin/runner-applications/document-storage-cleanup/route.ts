import {
  retryRunnerDocumentStorageDeletions,
} from "@/apps/admin/server/runner-application-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return retryRunnerDocumentStorageDeletions(request);
}