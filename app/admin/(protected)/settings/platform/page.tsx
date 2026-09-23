import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  getPlatformSettingsSnapshot,
  listPlatformSettingsHistory,
} from '@/lib/admin/platform-settings';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import PlatformSettingsForm from '@/app/admin/components/PlatformSettingsForm';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function PlatformSettingsPage() {
  const session =
    await requireAdminCapability(
      'settings.read',
    );

  const [
    snapshot,
    history,
  ] =
    await Promise.all([
      getPlatformSettingsSnapshot(),
      listPlatformSettingsHistory(
        20,
      ),
    ]);

  return (
    <PlatformSettingsForm
      initialSnapshot={
        snapshot
      }
      initialHistory={
        history
      }
      canManage={
        hasAdminCapability(
          session.role,
          'settings.manage',
        )
      }
    />
  );
}
