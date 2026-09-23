import 'server-only';

import {
  config,
} from 'dotenv';

import {
  upgradeInstalledModulesAcrossTenants,
  upgradeInstalledModulesForTenant,
} from '@/lib/services/module-upgrades';

config({
  path:
    '.env.local',
});

function argument(
  name:
    string,
) {
  const index =
    process.argv.indexOf(
      name,
    );

  if (
    index <
      0
  ) {
    return null;
  }

  return (
    process.argv[
      index +
        1
    ] ||
    null
  );
}

async function main() {
  const tenantId =
    argument(
      '--tenant',
    );

  const result =
    tenantId
      ? {
          tenantId,
          upgrades:
            await upgradeInstalledModulesForTenant(
              tenantId,
            ),
        }
      : await upgradeInstalledModulesAcrossTenants();

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );
}

main()
  .then(
    () =>
      process.exit(
        0,
      ),
  )
  .catch(
    error => {
      console.error(
        '[SaMi] Module migration failed:',
        error,
      );

      process.exit(
        1,
      );
    },
  );
