import AccountingWorkspace from "@/app/apps/accounting/AccountingWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PayablesDocumentPage({
  params,
}: {
  params: Promise<{documentId:string}>;
}) {
  const {documentId}=await params;
  return <AccountingWorkspace section="payables" filters={{documentId}} />;
}
