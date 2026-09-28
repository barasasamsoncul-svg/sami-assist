import SmsMarketingWorkspace from '@/app/apps/sms_marketing/SmsMarketingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SmsMarketingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SmsMarketingWorkspace section={section} />;
}
