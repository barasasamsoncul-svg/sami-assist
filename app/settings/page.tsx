import { getAccountContextForUser } from '@/lib/auth/account-context';
import { requirePageSession } from '@/lib/auth/require-page-session';
import SettingsClient from './SettingsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePageSession('/settings');
  const context = await getAccountContextForUser(session.user.id);

  return (
    <SettingsClient
      user={session.user}
      tenant={context.tenant}
      membership={context.membership}
      subscription={context.subscription}
      modules={context.modules}
      session={{
        id: session.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        device: {
          deviceType: session.device.deviceType || 'Unknown device',
          browser: session.device.browser || 'Unknown browser',
          operatingSystem: session.device.operatingSystem || 'Unknown OS',
          lastActiveAt: session.device.lastActiveAt ? session.device.lastActiveAt.toISOString() : null,
        },
      }}
    />
  );
}
