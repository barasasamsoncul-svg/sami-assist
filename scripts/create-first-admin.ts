import 'dotenv/config';

import {
  hashAdminPassword,
  isValidAdminEmail,
  isValidAdminPassword,
  normalizeAdminEmail,
} from '../lib/auth/admin-auth';

import {
  queryControl,
} from '../lib/db/control';

async function main() {
  const firstName =
    process.env.SAMI_BOOTSTRAP_ADMIN_FIRST_NAME?.trim();

  const lastName =
    process.env.SAMI_BOOTSTRAP_ADMIN_LAST_NAME?.trim();

  const email =
    normalizeAdminEmail(
      process.env.SAMI_BOOTSTRAP_ADMIN_EMAIL
    );

  const password =
    process.env.SAMI_BOOTSTRAP_ADMIN_PASSWORD ?? '';

  if (!firstName) {
    throw new Error(
      'SAMI_BOOTSTRAP_ADMIN_FIRST_NAME is required.'
    );
  }

  if (!lastName) {
    throw new Error(
      'SAMI_BOOTSTRAP_ADMIN_LAST_NAME is required.'
    );
  }

  if (!isValidAdminEmail(email)) {
    throw new Error(
      'SAMI_BOOTSTRAP_ADMIN_EMAIL is missing or invalid.'
    );
  }

  if (!isValidAdminPassword(password)) {
    throw new Error(
      [
        'SAMI_BOOTSTRAP_ADMIN_PASSWORD does not meet the admin password policy.',
        'Use at least 12 characters with:',
        '- uppercase letter',
        '- lowercase letter',
        '- number',
        '- symbol',
      ].join('\n')
    );
  }

  /* ==========================================================
     CHECK WHETHER PLATFORM ALREADY HAS AN ADMIN
     ========================================================== */

  const existingAdminCount =
    await queryControl(
      `
        SELECT
          COUNT(*)::integer AS count
        FROM platform_admins
        WHERE deleted_at IS NULL
      `
    );

  const count =
    Number(
      existingAdminCount.rows[0]?.count ?? 0
    );

  if (count > 0) {
    throw new Error(
      `Bootstrap refused: ${count} platform administrator account(s) already exist.`
    );
  }

  /* ==========================================================
     HASH PASSWORD USING SAMI'S REAL ADMIN AUTH IMPLEMENTATION
     ========================================================== */

  const passwordHash =
    await hashAdminPassword(
      password
    );

  /* ==========================================================
     CREATE INITIAL SUPER ADMIN
     ========================================================== */

  const result =
    await queryControl(
      `
        INSERT INTO platform_admins (
          first_name,
          last_name,
          email,
          password_hash,

          role,
          status,

          email_verified,
          email_verified_at,

          two_factor_required,
          two_factor_enabled,

          failed_login_attempts,
          locked_until,

          password_changed_at,

          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,

          'super_admin',
          'active',

          TRUE,
          NOW(),

          FALSE,
          FALSE,

          0,
          NULL,

          NOW(),

          NOW(),
          NOW()
        )

        RETURNING
          id,
          first_name,
          last_name,
          email,
          role,
          status,
          email_verified,
          two_factor_required,
          two_factor_enabled,
          created_at
      `,
      [
        firstName,
        lastName,
        email,
        passwordHash,
      ]
    );

  const admin =
    result.rows[0];

  console.log('');
  console.log('========================================');
  console.log(' SaMi First Platform Admin Created');
  console.log('========================================');
  console.log('');
  console.log(`ID:       ${admin.id}`);
  console.log(
    `Name:     ${admin.first_name} ${admin.last_name}`
  );
  console.log(`Email:    ${admin.email}`);
  console.log(`Role:     ${admin.role}`);
  console.log(`Status:   ${admin.status}`);
  console.log(
    `Verified: ${admin.email_verified}`
  );
  console.log('');
  console.log(
    'The password was hashed and was not written to the database in plaintext.'
  );
  console.log('');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('Failed to create SaMi platform administrator.');
    console.error('');

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    console.error('');

    process.exit(1);
  });