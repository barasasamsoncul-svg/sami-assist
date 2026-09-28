export class SamiModuleMigrationError
  extends Error {
  readonly code:
    | 'MODULE_VERSION_INVALID'
    | 'MODULE_DOWNGRADE_UNSUPPORTED'
    | 'MODULE_MIGRATION_PATH_MISSING'
    | 'MODULE_MIGRATION_REGISTRY_INVALID'
    | 'MODULE_MIGRATION_UNSAFE'
    | 'MODULE_MIGRATION_FAILED';

  constructor(
    code:
      SamiModuleMigrationError['code'],
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'SamiModuleMigrationError';

    this.code =
      code;
  }
}
