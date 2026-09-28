import SalesInboxWorkspace from '@/app/apps/sales_inbox/SalesInboxWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SalesInboxSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SalesInboxWorkspace section={section} />;
}
