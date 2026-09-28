import OrgChartWorkspace from '@/app/apps/org_chart/OrgChartWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OrgChartSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <OrgChartWorkspace section={section} />;
}
