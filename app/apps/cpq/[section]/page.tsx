import CpqWorkspace from '@/app/apps/cpq/CpqWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CpqSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CpqWorkspace section={section} />;
}
