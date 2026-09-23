import PlatformServiceManager from '@/app/admin/components/PlatformServiceManager';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  listPlatformServiceSubscriptions,
} from '@/lib/admin/platform-services';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminPlatformServicesPage() {
  const session =
    await requireAdminCapability(
      'providers.read',
    );

  const services =
    await listPlatformServiceSubscriptions();

  return (
    <PlatformServiceManager
      services={
        services
      }
      canManage={
        hasAdminCapability(
          session.role,
          'providers.manage',
        )
      }
    />
  );
}
