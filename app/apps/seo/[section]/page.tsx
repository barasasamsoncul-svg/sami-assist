import SeoWorkspace from '@/app/apps/seo/SeoWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SeoSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SeoWorkspace section={section} />;
}
