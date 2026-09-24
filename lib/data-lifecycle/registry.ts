import 'server-only';

import {
  filterAccessibleModuleExtensions,
  getSamiModuleManifest,
  getSamiModuleManifests,
} from '@/lib/modules/registry';

import {
  SUITE_DATA_LIFECYCLE_HANDLERS,
} from '@/lib/data-lifecycle/suite-export';

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

/*
 * Code-owned module lifecycle handlers.
 *
 * Business data must never become executable from control-database
 * metadata. As modules are implemented, their handlers are imported
 * here and added to this array.
 */
export const APP_DATA_LIFECYCLE_HANDLERS:
  readonly SamiModuleDataLifecycleHandler[] =
  SUITE_DATA_LIFECYCLE_HANDLERS;

function normalizeModuleKey(
  value: string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}

function uniqueHandlers() {
  const seen =
    new Set<string>();

  for (
    const handler
    of APP_DATA_LIFECYCLE_HANDLERS
  ) {
    const key =
      normalizeModuleKey(
        handler.moduleKey,
      );

    if (
      !key
    ) {
      throw new Error(
        'SaMi data lifecycle handler has an empty module key.',
      );
    }

    if (
      seen.has(
        key,
      )
    ) {
      throw new Error(
        `Duplicate SaMi data lifecycle handler for module ${key}.`,
      );
    }

    seen.add(
      key,
    );
  }

  return seen;
}

export function assertSamiDataLifecycleRuntime() {
  const registered =
    uniqueHandlers();

  for (
    const manifest
    of getSamiModuleManifests()
  ) {
    const key =
      normalizeModuleKey(
        manifest.key,
      );

    const handler =
      APP_DATA_LIFECYCLE_HANDLERS
        .find(
          item =>
            normalizeModuleKey(
              item.moduleKey,
            ) ===
            key,
        );

    if (
      manifest.extensions
        .dataExport &&
      (
        !registered.has(
          key,
        ) ||
        !handler
          ?.exportData
      )
    ) {
      throw new Error(
        `SaMi module ${key} enables data export without a code-owned export handler.`,
      );
    }

    if (
      manifest.extensions
        .dataErasure &&
      (
        !registered.has(
          key,
        ) ||
        !handler
          ?.planErasure ||
        !handler
          ?.executeErasure
      )
    ) {
      throw new Error(
        `SaMi module ${key} enables data erasure without plan and execute handlers.`,
      );
    }
  }
}

export function getAccessibleModuleDataExportHandlers(
  accessibleModuleKeys: string[],
) {
  assertSamiDataLifecycleRuntime();

  return filterAccessibleModuleExtensions(
    [
      ...APP_DATA_LIFECYCLE_HANDLERS,
    ],
    accessibleModuleKeys,
    handler =>
      handler.moduleKey,
  )
    .filter(
      handler =>
        Boolean(
          getSamiModuleManifest(
            handler.moduleKey,
          )
            ?.extensions
            .dataExport &&
          handler.exportData,
        ),
    );
}

export function getAccessibleModuleDataErasureHandlers(
  accessibleModuleKeys: string[],
) {
  assertSamiDataLifecycleRuntime();

  return filterAccessibleModuleExtensions(
    [
      ...APP_DATA_LIFECYCLE_HANDLERS,
    ],
    accessibleModuleKeys,
    handler =>
      handler.moduleKey,
  )
    .filter(
      handler =>
        Boolean(
          getSamiModuleManifest(
            handler.moduleKey,
          )
            ?.extensions
            .dataErasure &&
          handler.planErasure &&
          handler.executeErasure,
        ),
    );
}
