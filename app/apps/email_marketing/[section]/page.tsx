import EmailMarketingWorkspace from '@/app/apps/email_marketing/EmailMarketingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EmailMarketingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <EmailMarketingWorkspace section={section} />;
}
