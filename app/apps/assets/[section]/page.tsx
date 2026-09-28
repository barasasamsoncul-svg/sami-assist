import AssetsWorkspace from '@/app/apps/assets/AssetsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AssetsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AssetsWorkspace section={section} />;
}
