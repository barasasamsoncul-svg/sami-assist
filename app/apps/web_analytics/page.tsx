import WebAnalyticsWorkspace from '@/app/apps/web_analytics/WebAnalyticsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function WebAnalyticsPage() {
  return <WebAnalyticsWorkspace />;
}
