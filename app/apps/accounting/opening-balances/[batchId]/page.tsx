import AccountingWorkspace from "@/app/apps/accounting/AccountingWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpeningBalanceBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{
    batchId: string;
  }>;
  searchParams: Promise<{
    page?: string;
  }>;
}) {
  const {
    batchId,
  } =
    await params;

  const {
    page,
  } =
    await searchParams;

  return (
    <AccountingWorkspace
      section="opening-balances"
      filters={{
        batchId,
        page,
      }}
    />
  );
}
