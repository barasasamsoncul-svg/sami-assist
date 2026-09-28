import type {
  PoolClient,
} from 'pg';

export type SamiModuleMigrationContext = {
  moduleKey: string;
  namespace: string;
  fromVersion: string;
  toVersion: string;
};

export type SamiModuleMigrationDefinition = {
  key: string;
  moduleKey: string;
  namespace: string;
  fromVersion: string;
  toVersion: string;
  run: (
    client: PoolClient,
    context: SamiModuleMigrationContext,
  ) => Promise<void>;
};

export type SamiModuleMigrationResult = {
  moduleKey: string;
  previousVersion: string;
  currentVersion: string;
  targetVersion: string;
  appliedMigrations: string[];
  changed: boolean;
};
