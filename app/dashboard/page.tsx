import { getAccountContextForUser } from '@/lib/auth/account-context';
import { requirePageSession } from '@/lib/auth/require-page-session';
import DashboardClient from './DashboardClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requirePageSession('/dashboard');
  const context = await getAccountContextForUser(session.user.id);

  return (
    <DashboardClient
      user={session.user}
      tenant={context.tenant}
      membership={context.membership}
      subscription={context.subscription}
      modules={context.modules}
    />
  );
}
