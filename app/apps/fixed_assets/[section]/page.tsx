import FixedAssetsWorkspace from '@/app/apps/fixed_assets/FixedAssetsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FixedAssetsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <FixedAssetsWorkspace section={section} />;
}
