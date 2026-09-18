import 'server-only';


/* ================================================================
   SaMi TENANT BACKUP PROVIDER CONTRACT
   ================================================================

   This defines how SaMi can communicate with a real infrastructure
   backup provider.

   It does NOT itself create backups.

   A provider adapter can later implement:

   - provider snapshots
   - point-in-time recovery
   - logical exports
   - restore operations

   SaMi must never record a recovery point as AVAILABLE unless the
   provider confirms that a real recovery source exists.
   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type TenantRecoveryType =
  | 'provider_snapshot'
  | 'point_in_time'
  | 'logical_export';


export interface TenantBackupSource {
  tenantId:
    string;

  databaseId:
    string;

  databaseName:
    string;

  databaseIdentifier:
    string | null;

  databaseHost:
    string | null;

  databasePort:
    number;

  schemaVersion:
    string | null;

  provider:
    string;
}


export interface CreateRecoveryPointInput {
  source:
    TenantBackupSource;

  recoveryType:
    TenantRecoveryType;

  reason:
    string | null;
}


export interface ProviderRecoveryPoint {
  provider:
    string;

  providerReference:
    string;

  recoveryType:
    TenantRecoveryType;

  available:
    boolean;

  expiresAt:
    Date | null;

  metadata:
    Record<string, unknown>;
}


export interface RestoreRecoveryPointInput {
  providerReference:
    string;

  tenantId:
    string;

  sourceDatabaseName:
    string;

  targetDatabaseName:
    string;
}


export interface ProviderRestoreResult {
  restored:
    boolean;

  targetDatabaseName:
    string;

  providerReference:
    string | null;

  metadata:
    Record<string, unknown>;
}


/* ================================================================
   PROVIDER INTERFACE
   ================================================================ */

export interface TenantBackupProvider {
  readonly key:
    string;


  createRecoveryPoint(
    input:
      CreateRecoveryPointInput,
  ): Promise<ProviderRecoveryPoint>;


  verifyRecoveryPoint(
    providerReference:
      string,
  ): Promise<{
    available: boolean;
    expiresAt: Date | null;
  }>;


  restoreRecoveryPoint(
    input:
      RestoreRecoveryPointInput,
  ): Promise<ProviderRestoreResult>;


  deleteRecoveryPoint(
    providerReference:
      string,
  ): Promise<void>;
}


/* ================================================================
   PROVIDER NOT CONFIGURED
   ================================================================ */

export class TenantBackupProviderError
  extends Error {
  readonly code:
    | 'BACKUP_PROVIDER_NOT_CONFIGURED'
    | 'BACKUP_PROVIDER_FAILED'
    | 'RECOVERY_POINT_NOT_FOUND'
    | 'RESTORE_FAILED';


  constructor(
    code:
      | 'BACKUP_PROVIDER_NOT_CONFIGURED'
      | 'BACKUP_PROVIDER_FAILED'
      | 'RECOVERY_POINT_NOT_FOUND'
      | 'RESTORE_FAILED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantBackupProviderError';

    this.code =
      code;
  }
}


/* ================================================================
   PROVIDER REGISTRY
   ================================================================ */

const providers =
  new Map<
    string,
    TenantBackupProvider
  >();


/**
 * Register a real provider implementation.
 *
 * This is infrastructure registration, not a public/customer API.
 */
export function registerTenantBackupProvider(
  provider:
    TenantBackupProvider,
): void {
  const key =
    provider.key
      .trim()
      .toLowerCase();


  if (
    !key
  ) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      'Backup provider key is required.',
    );
  }


  providers.set(
    key,
    provider,
  );
}


/**
 * Resolve a configured provider.
 */
export function getTenantBackupProvider(
  providerKey:
    string,
): TenantBackupProvider {
  const normalized =
    providerKey
      .trim()
      .toLowerCase();


  const provider =
    providers.get(
      normalized,
    );


  if (
    !provider
  ) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      `No tenant backup provider is configured for "${normalized}".`,
    );
  }


  return provider;
}


/**
 * Mainly useful for tests.
 */
export function clearTenantBackupProviders():
  void {
  providers.clear();
}