import MarketingAutomationWorkspace from '@/app/apps/marketing_automation/MarketingAutomationWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MarketingAutomationSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <MarketingAutomationWorkspace section={section} />;
}
