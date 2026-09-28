import SalesInboxWorkspace from '@/app/apps/sales_inbox/SalesInboxWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SalesInboxPage() {
  return <SalesInboxWorkspace />;
}
