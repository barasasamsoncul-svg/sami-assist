import PlatformAlertPreferencesForm from '@/app/admin/components/PlatformAlertPreferencesForm';

import {
  getPlatformAdminAlertPreferences,
} from '@/lib/admin/alert-preferences';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  getSamiSmsProvider,
} from '@/lib/services/sms';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminNotificationSettingsPage() {
  const session =
    await requireAdminSession();

  const preferences =
    await getPlatformAdminAlertPreferences(
      session.adminId,
    );

  return (
    <PlatformAlertPreferencesForm
      initial={
        preferences
      }
      smsProvider={
        getSamiSmsProvider()
      }
    />
  );
}
