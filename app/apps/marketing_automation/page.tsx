import MarketingAutomationWorkspace from '@/app/apps/marketing_automation/MarketingAutomationWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function MarketingAutomationPage() {
  return <MarketingAutomationWorkspace />;
}
