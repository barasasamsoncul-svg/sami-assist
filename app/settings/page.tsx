import { requirePageSession } from '@/lib/auth/require-page-session';
import { getAccountContextForUser } from '@/lib/auth/account-context';
import SettingsClient from './SettingsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePageSession('/settings');

  const accountContext =
    await getAccountContextForUser(session.user.id);

  return (
    <SettingsClient
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