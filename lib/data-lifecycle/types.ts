export type SamiDataLifecycleContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  isOwner: boolean;
  permissionKeys: string[];
  accessibleModuleKeys: string[];
  companyId: string | null;
};

export type SamiModuleDataExportResult = {
  moduleKey: string;
  version: string;
  generatedAt: string;
  data: unknown;
};

export type SamiModuleDataErasurePlan = {
  moduleKey: string;
  blockers: string[];
  recordCounts: Record<string, number>;
  notes?: string[];
};

export type SamiModuleDataErasureResult = {
  moduleKey: string;
  erasedRecords: number;
  anonymizedRecords: number;
  retainedRecords: number;
  notes?: string[];
};

export type SamiModuleDataLifecycleHandler = {
  moduleKey: string;

  exportData?: (
    context: SamiDataLifecycleContext,
  ) => Promise<SamiModuleDataExportResult>;

  planErasure?: (
    context: SamiDataLifecycleContext,
  ) => Promise<SamiModuleDataErasurePlan>;

  executeErasure?: (
    context: SamiDataLifecycleContext,
  ) => Promise<SamiModuleDataErasureResult>;
};
