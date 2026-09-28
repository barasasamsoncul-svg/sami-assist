import CommissionsWorkspace from '@/app/apps/commissions/CommissionsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CommissionsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CommissionsWorkspace section={section} />;
}
