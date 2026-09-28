import SmsMarketingWorkspace from '@/app/apps/sms_marketing/SmsMarketingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SmsMarketingPage() {
  return <SmsMarketingWorkspace />;
}
