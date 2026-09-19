import 'server-only';

import {
  getPermissionContext,
  permissionContextHas,
  permissionContextHasAll,
  permissionContextHasAny,
  type EffectivePermission,
  type PermissionContext,
} from '@/lib/auth/permission-context';

import {
  requireCompanyContext,
  type CompanyContextCompany,
  type TrustedCompanyContext,
} from '@/lib/auth/company-context';


/* ================================================================
   SaMi COMPANY-AWARE AUTHORIZATION
   ================================================================

   Category 8.8

   PURPOSE

   Combine:

       permissions
          =
       WHAT the user may do

   with:

       company context
          =
       WHERE the user may do it


   TRUST CHAIN

       authenticated session
              ↓
       active internal membership
              ↓
       trusted workspace
              ↓
       effective permissions
              ↓
       allowed companies
              ↓
       selected companies
              ↓
       current company
              ↓
       company-aware authorization


   EXAMPLES

   User has:

       invoicing.invoice.view

   but only company access to:

       Company A

   Then:

       Company A invoice access  → allowed
       Company B invoice access  → denied


   IMPORTANT

   Browser-provided company IDs are NEVER trusted.

   A company ID supplied to this file must still exist inside the
   user's trusted allowed-company context.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export interface CompanyPermissionContext {
  sessionId:
    string;

  userId:
    string;

  tenantId:
    string;

  isOwner:
    boolean;

  permissionContext:
    PermissionContext;

  companyContext:
    TrustedCompanyContext;

  currentCompanyId:
    string;

  selectedCompanyIds:
    string[];

  allowedCompanyIds:
    string[];

  currentCompany:
    CompanyContextCompany;

  selectedCompanies:
    CompanyContextCompany[];

  allowedCompanies:
    CompanyContextCompany[];
}


export interface SpecificCompanyPermissionContext
  extends CompanyPermissionContext {
  companyId:
    string;

  company:
    CompanyContextCompany;
}


export interface PermissionRequirementResult {
  permission:
    EffectivePermission;

  context:
    CompanyPermissionContext;
}


/* ================================================================
   ERROR
   ================================================================ */

export class CompanyPermissionGuardError
  extends Error {
  readonly code:
    | 'INVALID_PERMISSION'
    | 'PERMISSION_REQUIRED'
    | 'ANY_PERMISSION_REQUIRED'
    | 'ALL_PERMISSIONS_REQUIRED'
    | 'INVALID_COMPANY_ID'
    | 'COMPANY_ACCESS_DENIED'
    | 'COMPANY_NOT_SELECTED'
    | 'CONTEXT_MISMATCH';


  readonly permissions:
    string[];

  readonly companyId:
    string | null;


  constructor(
    code:
      | 'INVALID_PERMISSION'
      | 'PERMISSION_REQUIRED'
      | 'ANY_PERMISSION_REQUIRED'
      | 'ALL_PERMISSIONS_REQUIRED'
      | 'INVALID_COMPANY_ID'
      | 'COMPANY_ACCESS_DENIED'
      | 'COMPANY_NOT_SELECTED'
      | 'CONTEXT_MISMATCH',

    message:
      string,

    options?: {
      permissions?:
        string[];

      companyId?:
        string | null;
    },
  ) {
    super(
      message,
    );

    this.name =
      'CompanyPermissionGuardError';

    this.code =
      code;

    this.permissions =
      options?.permissions ||
      [];

    this.companyId =
      options?.companyId ||
      null;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/* ================================================================
   PERMISSION NORMALIZATION
   ================================================================ */

function normalizePermission(
  value:
    unknown,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_PERMISSION',
      'A valid permission key is required.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !normalized
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_PERMISSION',
      'A valid permission key is required.',
    );
  }


  return normalized;
}


function normalizePermissions(
  values:
    readonly string[],
): string[] {
  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_PERMISSION',
      'Permission keys must be provided as an array.',
    );
  }


  return [
    ...new Set(
      values.map(
        normalizePermission,
      ),
    ),
  ];
}


/* ================================================================
   COMPANY ID VALIDATION
   ================================================================ */

function normalizeCompanyId(
  value:
    unknown,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_COMPANY_ID',
      'A valid company ID is required.',
    );
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_COMPANY_ID',
      'A valid company ID is required.',
    );
  }


  return normalized;
}


/* ================================================================
   CONTEXT CONSISTENCY
   ================================================================

   PermissionContext and CompanyContext both independently resolve
   trusted server-side context.

   Before combining them we verify that they belong to the exact
   same:

       session
       user
       workspace

   This protects against a session/workspace change occurring
   between context resolution calls.

   ================================================================ */

function assertContextsMatch(
  permissionContext:
    PermissionContext,

  companyContext:
    TrustedCompanyContext,
): void {
  if (
    permissionContext.sessionId !==
      companyContext.sessionId ||

    permissionContext.userId !==
      companyContext.userId ||

    permissionContext.tenantId !==
      companyContext.tenantId
  ) {
    throw new CompanyPermissionGuardError(
      'CONTEXT_MISMATCH',
      'The active workspace or company context changed during authorization.',
    );
  }
}


/* ================================================================
   BUILD COMBINED CONTEXT
   ================================================================ */

function buildCompanyPermissionContext(
  permissionContext:
    PermissionContext,

  companyContext:
    TrustedCompanyContext,
): CompanyPermissionContext {
  assertContextsMatch(
    permissionContext,
    companyContext,
  );


  return {
    sessionId:
      permissionContext.sessionId,

    userId:
      permissionContext.userId,

    tenantId:
      permissionContext.tenantId,

    isOwner:
      permissionContext.isOwner,

    permissionContext,

    companyContext,

    currentCompanyId:
      companyContext.currentCompanyId,

    selectedCompanyIds: [
      ...companyContext.selectedCompanyIds,
    ],

    allowedCompanyIds: [
      ...companyContext.allowedCompanyIds,
    ],

    currentCompany:
      companyContext.currentCompany,

    selectedCompanies: [
      ...companyContext.selectedCompanies,
    ],

    allowedCompanies: [
      ...companyContext.allowedCompanies,
    ],
  };
}


/* ================================================================
   RESOLVE COMPANY-AWARE CONTEXT
   ================================================================ */

export async function getCompanyPermissionContext():
  Promise<CompanyPermissionContext> {
  /*
   * Permission context establishes:
   *
   * session
   * workspace
   * membership
   * roles
   * permissions
   *
   * Company context establishes:
   *
   * allowed companies
   * selected companies
   * current company
   */
  const [
    permissionContext,
    companyContext,
  ] =
    await Promise.all([
      getPermissionContext(),
      requireCompanyContext(),
    ]);


  return buildCompanyPermissionContext(
    permissionContext,
    companyContext,
  );
}


/* ================================================================
   GET REGISTERED PERMISSION
   ================================================================ */

function getRegisteredPermission(
  context:
    PermissionContext,

  permission:
    string,
): EffectivePermission | null {
  const normalized =
    normalizePermission(
      permission,
    );


  return (
    context.permissions.find(
      item =>
        item.key ===
        normalized,
    ) ||
    null
  );
}


/* ================================================================
   ASSERT ONE PERMISSION
   ================================================================ */

export function assertCompanyPermission(
  context:
    CompanyPermissionContext,

  permission:
    string,
): void {
  const normalized =
    normalizePermission(
      permission,
    );


  if (
    !permissionContextHas(
      context.permissionContext,
      normalized,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'PERMISSION_REQUIRED',
      'You do not have permission to perform this action.',
      {
        permissions: [
          normalized,
        ],
      },
    );
  }
}


/* ================================================================
   ASSERT ANY PERMISSION
   ================================================================ */

export function assertAnyCompanyPermission(
  context:
    CompanyPermissionContext,

  permissions:
    readonly string[],
): void {
  const normalized =
    normalizePermissions(
      permissions,
    );


  if (
    normalized.length ===
      0
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_PERMISSION',
      'At least one permission is required.',
    );
  }


  if (
    !permissionContextHasAny(
      context.permissionContext,
      normalized,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'ANY_PERMISSION_REQUIRED',
      'You do not have permission to perform this action.',
      {
        permissions:
          normalized,
      },
    );
  }
}


/* ================================================================
   ASSERT ALL PERMISSIONS
   ================================================================ */

export function assertAllCompanyPermissions(
  context:
    CompanyPermissionContext,

  permissions:
    readonly string[],
): void {
  const normalized =
    normalizePermissions(
      permissions,
    );


  if (
    normalized.length ===
      0
  ) {
    throw new CompanyPermissionGuardError(
      'INVALID_PERMISSION',
      'At least one permission is required.',
    );
  }


  if (
    !permissionContextHasAll(
      context.permissionContext,
      normalized,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'ALL_PERMISSIONS_REQUIRED',
      'You do not have all permissions required to perform this action.',
      {
        permissions:
          normalized,
      },
    );
  }
}


/* ================================================================
   ASSERT COMPANY IS ALLOWED
   ================================================================ */

export function assertAllowedCompany(
  context:
    CompanyPermissionContext,

  companyId:
    string,
): CompanyContextCompany {
  const normalizedCompanyId =
    normalizeCompanyId(
      companyId,
    );


  const company =
    context.allowedCompanies.find(
      item =>
        item.id ===
        normalizedCompanyId,
    );


  if (
    !company
  ) {
    throw new CompanyPermissionGuardError(
      'COMPANY_ACCESS_DENIED',
      'You do not have access to this company.',
      {
        companyId:
          normalizedCompanyId,
      },
    );
  }


  return company;
}


/* ================================================================
   ASSERT COMPANY IS SELECTED
   ================================================================ */

export function assertSelectedCompany(
  context:
    CompanyPermissionContext,

  companyId:
    string,
): CompanyContextCompany {
  const company =
    assertAllowedCompany(
      context,
      companyId,
    );


  if (
    !context.selectedCompanyIds.includes(
      company.id,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'COMPANY_NOT_SELECTED',
      'This company is not enabled in the current working context.',
      {
        companyId:
          company.id,
      },
    );
  }


  return company;
}


/* ================================================================
   REQUIRE CURRENT COMPANY PERMISSION
   ================================================================

   Use for ordinary transactional operations.

   Examples:

       create invoice
       create customer
       record payment
       create order
       create expense

   These operations normally belong to ONE current company.

   ================================================================ */

export async function requireCurrentCompanyPermission(
  permission:
    string,
): Promise<CompanyPermissionContext> {
  const context =
    await getCompanyPermissionContext();


  assertCompanyPermission(
    context,
    permission,
  );


  /*
   * requireCompanyContext() already guarantees the current company
   * belongs to the allowed company set.
   *
   * Assert again here because this function is specifically an
   * authorization boundary.
   */
  assertAllowedCompany(
    context,
    context.currentCompanyId,
  );


  return context;
}


/* ================================================================
   REQUIRE SELECTED-COMPANY PERMISSION
   ================================================================

   Use for multi-company operations.

   Examples:

       consolidated reporting
       cross-company dashboards
       global search
       selected-company analytics

   The operation may only operate on:

       context.selectedCompanyIds

   NEVER all tenant companies automatically.

   ================================================================ */

export async function requireSelectedCompaniesPermission(
  permission:
    string,
): Promise<CompanyPermissionContext> {
  const context =
    await getCompanyPermissionContext();


  assertCompanyPermission(
    context,
    permission,
  );


  if (
    context.selectedCompanyIds.length ===
      0
  ) {
    throw new CompanyPermissionGuardError(
      'COMPANY_ACCESS_DENIED',
      'No companies are enabled in the current working context.',
    );
  }


  for (
    const companyId
    of context.selectedCompanyIds
  ) {
    assertAllowedCompany(
      context,
      companyId,
    );
  }


  return context;
}


/* ================================================================
   REQUIRE SPECIFIC COMPANY PERMISSION
   ================================================================

   This is safe for an API receiving:

       companyId

   from a request.

   The browser companyId is treated only as a REQUESTED identifier.

   It must still pass:

       permission
       +
       current workspace
       +
       company_users access

   ================================================================ */

export async function requireCompanyPermission(
  permission:
    string,

  companyId:
    string,

  options?: {
    requireSelected?:
      boolean;
  },
): Promise<SpecificCompanyPermissionContext> {
  const normalizedCompanyId =
    normalizeCompanyId(
      companyId,
    );


  const context =
    await getCompanyPermissionContext();


  assertCompanyPermission(
    context,
    permission,
  );


  const company =
    options?.requireSelected ===
      true
      ? assertSelectedCompany(
          context,
          normalizedCompanyId,
        )
      : assertAllowedCompany(
          context,
          normalizedCompanyId,
        );


  return {
    ...context,

    companyId:
      normalizedCompanyId,

    company,
  };
}


/* ================================================================
   REQUIRE CURRENT COMPANY + ANY PERMISSION
   ================================================================ */

export async function requireCurrentCompanyAnyPermission(
  permissions:
    readonly string[],
): Promise<CompanyPermissionContext> {
  const context =
    await getCompanyPermissionContext();


  assertAnyCompanyPermission(
    context,
    permissions,
  );


  assertAllowedCompany(
    context,
    context.currentCompanyId,
  );


  return context;
}


/* ================================================================
   REQUIRE CURRENT COMPANY + ALL PERMISSIONS
   ================================================================ */

export async function requireCurrentCompanyAllPermissions(
  permissions:
    readonly string[],
): Promise<CompanyPermissionContext> {
  const context =
    await getCompanyPermissionContext();


  assertAllCompanyPermissions(
    context,
    permissions,
  );


  assertAllowedCompany(
    context,
    context.currentCompanyId,
  );


  return context;
}


/* ================================================================
   REQUIRE SPECIFIC COMPANY + ANY PERMISSION
   ================================================================ */

export async function requireCompanyAnyPermission(
  permissions:
    readonly string[],

  companyId:
    string,

  options?: {
    requireSelected?:
      boolean;
  },
): Promise<SpecificCompanyPermissionContext> {
  const normalizedCompanyId =
    normalizeCompanyId(
      companyId,
    );


  const context =
    await getCompanyPermissionContext();


  assertAnyCompanyPermission(
    context,
    permissions,
  );


  const company =
    options?.requireSelected ===
      true
      ? assertSelectedCompany(
          context,
          normalizedCompanyId,
        )
      : assertAllowedCompany(
          context,
          normalizedCompanyId,
        );


  return {
    ...context,

    companyId:
      normalizedCompanyId,

    company,
  };
}


/* ================================================================
   REQUIRE SPECIFIC COMPANY + ALL PERMISSIONS
   ================================================================ */

export async function requireCompanyAllPermissions(
  permissions:
    readonly string[],

  companyId:
    string,

  options?: {
    requireSelected?:
      boolean;
  },
): Promise<SpecificCompanyPermissionContext> {
  const normalizedCompanyId =
    normalizeCompanyId(
      companyId,
    );


  const context =
    await getCompanyPermissionContext();


  assertAllCompanyPermissions(
    context,
    permissions,
  );


  const company =
    options?.requireSelected ===
      true
      ? assertSelectedCompany(
          context,
          normalizedCompanyId,
        )
      : assertAllowedCompany(
          context,
          normalizedCompanyId,
        );


  return {
    ...context,

    companyId:
      normalizedCompanyId,

    company,
  };
}


/* ================================================================
   REQUIRE REGISTERED CURRENT-COMPANY PERMISSION
   ================================================================

   Same as requireCurrentCompanyPermission(), but also returns
   permission metadata.

   Useful when later module infrastructure needs:

       scope
       moduleKey
       resource
       action

   ================================================================ */

export async function requireRegisteredCurrentCompanyPermission(
  permission:
    string,
): Promise<PermissionRequirementResult> {
  const context =
    await requireCurrentCompanyPermission(
      permission,
    );


  const registered =
    getRegisteredPermission(
      context.permissionContext,
      permission,
    );


  /*
   * If permissionContextHas() succeeded, this should normally exist.
   * Keep this defensive check so authorization never relies on
   * inconsistent permission metadata.
   */
  if (
    !registered
  ) {
    throw new CompanyPermissionGuardError(
      'PERMISSION_REQUIRED',
      'The requested permission is not available.',
      {
        permissions: [
          normalizePermission(
            permission,
          ),
        ],
      },
    );
  }


  return {
    permission:
      registered,

    context,
  };
}


/* ================================================================
   BOOLEAN — CURRENT COMPANY
   ================================================================

   Intended for server-rendered UI capability information.

   This does NOT replace server-side mutation guards.

   ================================================================ */

export function canInCurrentCompany(
  context:
    CompanyPermissionContext,

  permission:
    string,
): boolean {
  try {
    if (
      !permissionContextHas(
        context.permissionContext,
        normalizePermission(
          permission,
        ),
      )
    ) {
      return false;
    }


    return context.allowedCompanyIds.includes(
      context.currentCompanyId,
    );
  } catch {
    return false;
  }
}


/* ================================================================
   BOOLEAN — SPECIFIC COMPANY
   ================================================================ */

export function canInCompany(
  context:
    CompanyPermissionContext,

  permission:
    string,

  companyId:
    string,

  options?: {
    requireSelected?:
      boolean;
  },
): boolean {
  try {
    const normalizedCompanyId =
      normalizeCompanyId(
        companyId,
      );


    if (
      !permissionContextHas(
        context.permissionContext,
        normalizePermission(
          permission,
        ),
      )
    ) {
      return false;
    }


    if (
      !context.allowedCompanyIds.includes(
        normalizedCompanyId,
      )
    ) {
      return false;
    }


    if (
      options?.requireSelected ===
        true &&
      !context.selectedCompanyIds.includes(
        normalizedCompanyId,
      )
    ) {
      return false;
    }


    return true;
  } catch {
    return false;
  }
}


/* ================================================================
   BOOLEAN — ANY PERMISSION IN CURRENT COMPANY
   ================================================================ */

export function canAnyInCurrentCompany(
  context:
    CompanyPermissionContext,

  permissions:
    readonly string[],
): boolean {
  try {
    const normalized =
      normalizePermissions(
        permissions,
      );


    if (
      normalized.length ===
        0
    ) {
      return false;
    }


    if (
      !permissionContextHasAny(
        context.permissionContext,
        normalized,
      )
    ) {
      return false;
    }


    return context.allowedCompanyIds.includes(
      context.currentCompanyId,
    );
  } catch {
    return false;
  }
}


/* ================================================================
   BOOLEAN — ALL PERMISSIONS IN CURRENT COMPANY
   ================================================================ */

export function canAllInCurrentCompany(
  context:
    CompanyPermissionContext,

  permissions:
    readonly string[],
): boolean {
  try {
    const normalized =
      normalizePermissions(
        permissions,
      );


    if (
      normalized.length ===
        0
    ) {
      return false;
    }


    if (
      !permissionContextHasAll(
        context.permissionContext,
        normalized,
      )
    ) {
      return false;
    }


    return context.allowedCompanyIds.includes(
      context.currentCompanyId,
    );
  } catch {
    return false;
  }
}


/* ================================================================
   COMPANY FILTER HELPERS
   ================================================================

   These helpers make it difficult for later module queries to
   accidentally operate across every company in the tenant DB.

   ================================================================ */

export function getCurrentCompanyId(
  context:
    CompanyPermissionContext,
): string {
  return context.currentCompanyId;
}


export function getSelectedCompanyIds(
  context:
    CompanyPermissionContext,
): string[] {
  return [
    ...context.selectedCompanyIds,
  ];
}


export function getAllowedCompanyIds(
  context:
    CompanyPermissionContext,
): string[] {
  return [
    ...context.allowedCompanyIds,
  ];
}


/* ================================================================
   SQL-SAFE COMPANY BOUNDARY HELPERS
   ================================================================

   These functions return trusted company IDs only.

   Example:

       const auth =
         await requireCurrentCompanyPermission(
           'invoicing.invoice.view'
         );

       await tenantPool.query(
         `
           SELECT *
           FROM invoices
           WHERE company_id = $1
         `,
         [
           auth.currentCompanyId
         ]
       );

   For reporting:

       const auth =
         await requireSelectedCompaniesPermission(
           'reporting.view'
         );

       await tenantPool.query(
         `
           SELECT *
           FROM invoices
           WHERE company_id = ANY($1::uuid[])
         `,
         [
           auth.selectedCompanyIds
         ]
       );

   ================================================================ */

export function requireTrustedCurrentCompanyId(
  context:
    CompanyPermissionContext,
): string {
  const companyId =
    context.currentCompanyId;


  if (
    !context.allowedCompanyIds.includes(
      companyId,
    )
  ) {
    throw new CompanyPermissionGuardError(
      'COMPANY_ACCESS_DENIED',
      'The current company is outside the permitted company boundary.',
      {
        companyId,
      },
    );
  }


  return companyId;
}


export function requireTrustedSelectedCompanyIds(
  context:
    CompanyPermissionContext,
): string[] {
  if (
    context.selectedCompanyIds.length ===
      0
  ) {
    throw new CompanyPermissionGuardError(
      'COMPANY_ACCESS_DENIED',
      'No companies are enabled in the current working context.',
    );
  }


  for (
    const companyId
    of context.selectedCompanyIds
  ) {
    if (
      !context.allowedCompanyIds.includes(
        companyId,
      )
    ) {
      throw new CompanyPermissionGuardError(
        'COMPANY_ACCESS_DENIED',
        'A selected company is outside the permitted company boundary.',
        {
          companyId,
        },
      );
    }
  }


  return [
    ...context.selectedCompanyIds,
  ];
}