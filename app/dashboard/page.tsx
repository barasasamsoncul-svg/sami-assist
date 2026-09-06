import { requirePageSession } from '@/lib/auth/require-page-session';
import { getAccountContextForUser } from '@/lib/auth/account-context';
import DashboardClient from './DashboardClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requirePageSession('/dashboard');

  const accountContext =
    await getAccountContextForUser(session.user.id);

  return (
    <DashboardClient
      user={session.user}
      tenant={accountContext.tenant}
      owner={accountContext.owner}
      membership={accountContext.membership}
      subscription={accountContext.subscription}
      modules={accountContext.modules}
      session={{
        id: session.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        device: {
          deviceType: session.device.deviceType,
          browser: session.device.browser,
          operatingSystem: session.device.operatingSystem,
          lastActiveAt: session.device.lastActiveAt
            ? session.device.lastActiveAt.toISOString()
            : null,
        },
      }}
    />
  );
}