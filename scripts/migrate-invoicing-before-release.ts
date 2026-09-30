import 'server-only';

import {
  config,
} from 'dotenv';

import {
  upgradeInstalledModuleAcrossTenants,
} from '@/lib/services/module-upgrades';

config({
  path:
    '.env.local',
});

config();


async function main() {
  const result =
    await upgradeInstalledModuleAcrossTenants(
      'invoicing',
    );

  console.log(
    JSON.stringify(
      {
        release:
          'invoicing',
        mode:
          'expand-before-promote',
        ...result,
      },
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
        '[SaMi] Invoicing pre-release migration failed:',
        error,
      );

      process.exit(
        1,
      );
    },
  );
