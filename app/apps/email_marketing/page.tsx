import EmailMarketingWorkspace from '@/app/apps/email_marketing/EmailMarketingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function EmailMarketingPage() {
  return <EmailMarketingWorkspace />;
}
