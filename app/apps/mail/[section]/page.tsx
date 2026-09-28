import MailWorkspace from '@/app/apps/mail/MailWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MailSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <MailWorkspace section={section} />;
}
