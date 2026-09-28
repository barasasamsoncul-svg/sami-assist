import WebAnalyticsWorkspace from '@/app/apps/web_analytics/WebAnalyticsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WebAnalyticsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <WebAnalyticsWorkspace section={section} />;
}
