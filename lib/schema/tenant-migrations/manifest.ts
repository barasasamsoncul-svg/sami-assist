/**
 * ================================================================
 * SaMi TENANT CORE MIGRATION MANIFEST
 * ================================================================
 *
 * This file defines the ordered upgrade path for existing
 * SaMi tenant databases.
 *
 * IMPORTANT:
 *
 * Registration does NOT use this manifest to build a new tenant.
 *
 * New tenants receive the latest complete tenant-core.sql.
 *
 * This manifest is only for upgrading databases that already exist.
 * ================================================================
 */

export interface TenantCoreMigration {
  key: string;

  fromVersion: string;
  toVersion: string;

  fileName: string;
}

/**
 * Current production tenant-core.sql version.
 *
 * tenant-core.sql currently installs:
 *
 *     1.2.0
 */
export const CURRENT_TENANT_CORE_VERSION =
  '1.2.0';

/**
 * Migration chain.
 *
 * Category 10 introduced the first tenant-core migration.
 * Category 14 extends core file/storage infrastructure to 1.2.0.
 * New tenants receive the complete latest tenant-core.sql.
 */
export const TENANT_CORE_MIGRATIONS:
  TenantCoreMigration[] = [
    {
      key: 'core-1.0.0-to-1.1.0',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      fileName: '001-core-1.0.0-to-1.1.0.sql',
    },
    {
      key: 'core-1.1.0-to-1.2.0',
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
      fileName: '002-core-1.1.0-to-1.2.0.sql',
    },
  ];