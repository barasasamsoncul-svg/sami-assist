import CashFlowWorkspace from '@/app/apps/cash_flow/CashFlowWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CashFlowPage() {
  return <CashFlowWorkspace />;
}
