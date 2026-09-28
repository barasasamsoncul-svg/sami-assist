import SocialMarketingWorkspace from '@/app/apps/social_marketing/SocialMarketingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SocialMarketingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SocialMarketingWorkspace section={section} />;
}
