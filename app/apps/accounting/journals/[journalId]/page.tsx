import AccountingWorkspace from "@/app/apps/accounting/AccountingWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountingJournalDetailPage({
  params,
}: {
  params: Promise<{
    journalId: string;
  }>;
}) {
  const {
    journalId,
  } =
    await params;

  return (
    <AccountingWorkspace
      section="journals"
      filters={{
        journalId,
      }}
    />
  );
}
