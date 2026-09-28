import SignWorkspace from '@/app/apps/sign/SignWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SignSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SignWorkspace section={section} />;
}
