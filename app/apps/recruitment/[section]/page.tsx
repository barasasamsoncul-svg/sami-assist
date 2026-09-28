import RecruitmentWorkspace from '@/app/apps/recruitment/RecruitmentWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RecruitmentSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <RecruitmentWorkspace section={section} />;
}
