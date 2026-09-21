import 'server-only';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import type {
  SamiModuleField,
  SamiModuleOperation,
  SamiModuleRecordPolicy,
  SamiModuleResource,
  SamiModuleScope,
} from '@/lib/modules/types';

export type SamiModuleSecurityContext = {
  userId: string;
  tenantId: string;
  isOwner: boolean;
  currentCompanyId: string | null;
  selectedCompanyIds: string[];
  allowedCompanyIds: string[];
  permissionSet: ReadonlySet<string>;
};

export type SamiRecordScope = {
  scope: SamiModuleScope;
  userId: string | null;
  companyIds: string[];
};

export type SamiResourceAccessDecision = {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'module_not_registered'
    | 'resource_not_registered'
    | 'permission_denied'
    | 'record_policy_denied'
    | 'company_context_required';
  moduleKey: string;
  resourceKey: string;
  operation: SamiModuleOperation;
  recordScopes: SamiRecordScope[];
  readableFields: string[];
  writableFields: string[];
};

function normalizeKey(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase();
}

function hasAllPermissions(
  context:
    SamiModuleSecurityContext,
  required:
    string[],
) {
  if (
    required.length ===
      0 ||
    context.isOwner
  ) {
    return true;
  }

  return required.every(
    permission =>
      context.permissionSet.has(
        permission,
      ),
  );
}

function fieldReadable(
  context:
    SamiModuleSecurityContext,
  field:
    SamiModuleField,
) {
  return hasAllPermissions(
    context,
    field.readPermissions ||
      [],
  );
}

function fieldWritable(
  context:
    SamiModuleSecurityContext,
  field:
    SamiModuleField,
) {
  if (
    field.readonly
  ) {
    return false;
  }

  return hasAllPermissions(
    context,
    field.writePermissions ||
      [],
  );
}

function policyApplies(
  context:
    SamiModuleSecurityContext,
  policy:
    SamiModuleRecordPolicy,
  operation:
    SamiModuleOperation,
) {
  return (
    policy.operations.includes(
      operation,
    ) &&
    hasAllPermissions(
      context,
      policy.requiredPermissions ||
        [],
    )
  );
}

function resolvePolicyScope(
  context:
    SamiModuleSecurityContext,
  policy:
    SamiModuleRecordPolicy,
): SamiRecordScope | null {
  switch (
    policy.scope
  ) {
    case 'user':
      return {
        scope: 'user',
        userId:
          context.userId,
        companyIds: [],
      };

    case 'company':
      if (
        !context.currentCompanyId ||
        !context.allowedCompanyIds.includes(
          context.currentCompanyId,
        )
      ) {
        return null;
      }

      return {
        scope: 'company',
        userId: null,
        companyIds: [
          context.currentCompanyId,
        ],
      };

    case 'selected_companies': {
      const selected =
        context.selectedCompanyIds
          .filter(
            companyId =>
              context.allowedCompanyIds.includes(
                companyId,
              ),
          );

      if (
        selected.length ===
        0
      ) {
        return null;
      }

      return {
        scope:
          'selected_companies',
        userId: null,
        companyIds:
          selected,
      };
    }

    case 'workspace':
      return {
        scope: 'workspace',
        userId: null,
        companyIds: [],
      };

    default:
      return null;
  }
}

function resolveResource(
  moduleKey:
    string,
  resourceKey:
    string,
): SamiModuleResource | null {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest
  ) {
    return null;
  }

  const normalized =
    normalizeKey(
      resourceKey,
    );

  return (
    manifest.resources.find(
      resource =>
        normalizeKey(
          resource.key,
        ) ===
        normalized,
    ) ||
    null
  );
}

export function resolveSamiResourceAccess(
  context:
    SamiModuleSecurityContext,
  input: {
    moduleKey: string;
    resourceKey: string;
    operation: SamiModuleOperation;
  },
): SamiResourceAccessDecision {
  const manifest =
    getSamiModuleManifest(
      input.moduleKey,
    );

  const base = {
    moduleKey:
      normalizeKey(
        input.moduleKey,
      ),
    resourceKey:
      normalizeKey(
        input.resourceKey,
      ),
    operation:
      input.operation,
  };

  if (
    !manifest
  ) {
    return {
      ...base,
      allowed: false,
      reason:
        'module_not_registered',
      recordScopes: [],
      readableFields: [],
      writableFields: [],
    };
  }

  const resource =
    resolveResource(
      manifest.key,
      input.resourceKey,
    );

  if (
    !resource
  ) {
    return {
      ...base,
      allowed: false,
      reason:
        'resource_not_registered',
      recordScopes: [],
      readableFields: [],
      writableFields: [],
    };
  }

  const required =
    resource.permissions[
      input.operation
    ] ||
    [];

  if (
    !hasAllPermissions(
      context,
      required,
    )
  ) {
    return {
      ...base,
      allowed: false,
      reason:
        'permission_denied',
      recordScopes: [],
      readableFields: [],
      writableFields: [],
    };
  }

  const policies =
    manifest.security
      .recordPolicies
      .filter(
        policy =>
          normalizeKey(
            policy.resourceKey,
          ) ===
            normalizeKey(
              resource.key,
            ) &&
          policyApplies(
            context,
            policy,
            input.operation,
          ),
      );

  /*
   * Fail closed: a company-scoped business resource must explicitly
   * declare a record policy. This prevents a new module from becoming
   * workspace-wide merely because its CRUD permission exists.
   */
  if (
    resource.companyScoped &&
    policies.length ===
      0
  ) {
    return {
      ...base,
      allowed: false,
      reason:
        'record_policy_denied',
      recordScopes: [],
      readableFields: [],
      writableFields: [],
    };
  }

  const recordScopes =
    policies
      .map(
        policy =>
          resolvePolicyScope(
            context,
            policy,
          ),
      )
      .filter(
        (
          scope,
        ): scope is
          SamiRecordScope =>
          Boolean(
            scope,
          ),
      );

  if (
    resource.companyScoped &&
    recordScopes.length ===
      0
  ) {
    return {
      ...base,
      allowed: false,
      reason:
        'company_context_required',
      recordScopes: [],
      readableFields: [],
      writableFields: [],
    };
  }

  const fields =
    resource.fields ||
    [];

  return {
    ...base,
    allowed: true,
    reason: 'allowed',
    recordScopes,
    readableFields:
      fields
        .filter(
          field =>
            fieldReadable(
              context,
              field,
            ),
        )
        .map(
          field =>
            field.key,
        ),
    writableFields:
      fields
        .filter(
          field =>
            fieldWritable(
              context,
              field,
            ),
        )
        .map(
          field =>
            field.key,
        ),
  };
}

export function filterReadableSamiFields(
  decision:
    SamiResourceAccessDecision,
  record:
    Record<string, unknown>,
) {
  if (
    !decision.allowed
  ) {
    return {};
  }

  const allowed =
    new Set(
      decision.readableFields,
    );

  return Object.fromEntries(
    Object.entries(
      record,
    )
      .filter(
        ([key]) =>
          allowed.has(
            key,
          ),
      ),
  );
}

export function filterWritableSamiFields(
  decision:
    SamiResourceAccessDecision,
  input:
    Record<string, unknown>,
) {
  if (
    !decision.allowed
  ) {
    return {};
  }

  const allowed =
    new Set(
      decision.writableFields,
    );

  return Object.fromEntries(
    Object.entries(
      input,
    )
      .filter(
        ([key]) =>
          allowed.has(
            key,
          ),
      ),
  );
}
