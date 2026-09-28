import CashFlowWorkspace from '@/app/apps/cash_flow/CashFlowWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CashFlowSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CashFlowWorkspace section={section} />;
}
