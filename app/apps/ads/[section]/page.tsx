import AdsWorkspace from '@/app/apps/ads/AdsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AdsWorkspace section={section} />;
}
