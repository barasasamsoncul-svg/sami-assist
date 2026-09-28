import AppraisalsWorkspace from '@/app/apps/appraisals/AppraisalsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppraisalsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AppraisalsWorkspace section={section} />;
}
