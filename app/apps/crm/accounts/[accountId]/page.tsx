import CrmWorkspace from '@/app/apps/crm/CrmWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CrmAccount360Page({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <CrmWorkspace accountId={accountId} />;
}
