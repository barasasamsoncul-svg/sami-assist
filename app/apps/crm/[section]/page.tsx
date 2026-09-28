import CrmWorkspace from '@/app/apps/crm/CrmWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CrmSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CrmWorkspace section={section} />;
}
