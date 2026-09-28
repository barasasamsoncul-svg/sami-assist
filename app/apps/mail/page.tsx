import MailWorkspace from '@/app/apps/mail/MailWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function MailPage() {
  return <MailWorkspace />;
}
