
import RunnerApplicationDetail from "@/apps/admin/features/runner-applications/RunnerApplicationDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function RunnerApplicationDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

  return <RunnerApplicationDetail runnerId={id} />;
}
