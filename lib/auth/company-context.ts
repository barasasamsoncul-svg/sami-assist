import 'server-only';

import {
  getSession,
} from '@/lib/auth/session';

import {
  requireTenantContext,
} from '@/lib/auth/tenant-context';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


/* ================================================================
   SaMi TRUSTED COMPANY CONTEXT
   ================================================================

   Category 7.6

   Odoo-inspired terminology:

       allowed companies
           = companies user may access

       selected companies
           = companies enabled in current session context

       current company
           = primary active company for this operation

       default company
           = permanent starting preference

   SECURITY ORDER

       authenticated session
            ↓
       trusted workspace
            ↓
       active internal membership
            ↓
       allowed companies
            ↓
       selected companies
            ↓
       current company

   Browser-provided company IDs are NEVER trusted by themselves.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export interface CompanyContextCompany {
  id:
    string;

  name:
    string;

  legalName:
    string | null;

  logoUrl:
    string | null;

  currency:
    string;

  timezone:
    string;

  country:
    string | null;
}


export interface TrustedCompanyContext {
  sessionId:
    string;

  userId:
    string;

  tenantId:
    string;

  defaultCompanyId:
    string;

  currentCompanyId:
    string;

  selectedCompanyIds:
    string[];

  allowedCompanyIds:
    string[];

  defaultCompany:
    CompanyContextCompany;

  currentCompany:
    CompanyContextCompany;

  selectedCompanies:
    CompanyContextCompany[];

  allowedCompanies:
    CompanyContextCompany[];
}


export interface CompanySelectorState {
  currentCompanyId:
    string;

  defaultCompanyId:
    string;

  selectedCompanyIds:
    string[];

  companies:
    Array<
      CompanyContextCompany & {
        isCurrent:
          boolean;

        isDefault:
          boolean;

        isSelected:
          boolean;
      }
    >;
}


/* ================================================================
   ERROR
   ================================================================ */

export class CompanyContextError
  extends Error {
  readonly code:
    | 'UNAUTHENTICATED'
    | 'NO_WORKSPACE_SELECTED'
    | 'NO_COMPANY_ACCESS'
    | 'INVALID_COMPANY_ID'
    | 'COMPANY_ACCESS_DENIED'
    | 'EMPTY_COMPANY_SELECTION'
    | 'TOO_MANY_COMPANIES'
    | 'SESSION_UPDATE_FAILED';


  constructor(
    code:
      | 'UNAUTHENTICATED'
      | 'NO_WORKSPACE_SELECTED'
      | 'NO_COMPANY_ACCESS'
      | 'INVALID_COMPANY_ID'
      | 'COMPANY_ACCESS_DENIED'
      | 'EMPTY_COMPANY_SELECTION'
      | 'TOO_MANY_COMPANIES'
      | 'SESSION_UPDATE_FAILED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'CompanyContextError';

    this.code =
      code;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const MAX_SELECTED_COMPANIES =
  100;


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/* ================================================================
   HELPERS
   ================================================================ */

function requireCompanyId(
  companyId:
    string,
): string {
  if (
    typeof companyId !==
      'string'
  ) {
    throw new CompanyContextError(
      'INVALID_COMPANY_ID',
      'A valid company ID is required.',
    );
  }


  const normalized =
    companyId.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new CompanyContextError(
      'INVALID_COMPANY_ID',
      'A valid company ID is required.',
    );
  }


  return normalized;
}


function normalizeCompanyIds(
  companyIds:
    unknown,
): string[] {
  if (
    !Array.isArray(
      companyIds,
    )
  ) {
    return [];
  }


  const unique =
    [
      ...new Set(
        companyIds
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
              'string',
          )
          .map(
            value =>
              value.trim(),
          )
          .filter(
            value =>
              UUID_PATTERN.test(
                value,
              ),
          ),
      ),
    ];


  return unique;
}


function arraysEqual(
  left:
    string[],

  right:
    string[],
): boolean {
  if (
    left.length !==
      right.length
  ) {
    return false;
  }


  return left.every(
    (
      value,
      index,
    ) =>
      value ===
      right[index],
  );
}


function mapCompany(
  row:
    Record<
      string,
      unknown
    >,
): CompanyContextCompany {
  return {
    id:
      String(
        row.id ||
        '',
      ),

    name:
      typeof row.name ===
        'string'
        ? row.name
        : '',

    legalName:
      typeof row.legal_name ===
        'string'
        ? row.legal_name
        : null,

    logoUrl:
      typeof row.logo_url ===
        'string'
        ? row.logo_url
        : null,

    currency:
      typeof row.currency ===
        'string'
        ? row.currency
        : 'KES',

    timezone:
      typeof row.timezone ===
        'string'
        ? row.timezone
        : 'Africa/Nairobi',

    country:
      typeof row.country ===
        'string'
        ? row.country
        : null,
  };
}


/* ================================================================
   LOAD ALLOWED COMPANIES
   ================================================================ */

async function loadAllowedCompanies(
  tenantId:
    string,

  userId:
    string,
): Promise<{
  companies:
    CompanyContextCompany[];

  tenantDefaultHint:
    string | null;
}> {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );


  const result =
    await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.legal_name,
          c.logo_url,
          c.currency,
          c.timezone,
          c.country,

          cu.is_default

        FROM company_users cu

        INNER JOIN companies c
          ON c.id =
             cu.company_id

        WHERE cu.user_id = $1

          AND LOWER(
            COALESCE(
              cu.status,
              ''
            )
          ) = 'active'

          AND c.is_active =
              TRUE

          AND c.archived_at
              IS NULL

        ORDER BY
          CASE
            WHEN cu.is_default =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            c.name
          ) ASC,

          c.created_at ASC,

          c.id ASC
      `,
      [
        userId,
      ],
    );


  const companies =
    result.rows.map(
      row =>
        mapCompany(
          row,
        ),
    );


  const tenantDefaultHint =
    result.rows.find(
      row =>
        row.is_default ===
        true,
    );


  return {
    companies,

    tenantDefaultHint:
      tenantDefaultHint
        ? String(
            tenantDefaultHint.id,
          )
        : null,
  };
}


/* ================================================================
   CONTROL DEFAULT COMPANY
   ================================================================ */

async function getControlDefaultCompanyId(
  tenantId:
    string,

  userId:
    string,
): Promise<string | null> {
  const result =
    await queryControl(
      `
        SELECT
          default_company_id

        FROM tenant_users

        WHERE tenant_id = $1
          AND user_id = $2

          AND LOWER(
            COALESCE(
              status,
              ''
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              member_type,
              ''
            )
          ) = 'internal'

          AND deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tenantId,
        userId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    return null;
  }


  return typeof result.rows[0]
    .default_company_id ===
    'string'
      ? result.rows[0]
          .default_company_id
      : null;
}


/* ================================================================
   REPAIR DEFAULT COMPANY POINTER
   ================================================================ */

async function repairDefaultCompanyPointer(
  tenantId:
    string,

  userId:
    string,

  companyId:
    string,
): Promise<void> {
  await queryControl(
    `
      UPDATE tenant_users

      SET
        default_company_id =
          $3,

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND user_id = $2

        AND LOWER(
          COALESCE(
            status,
            ''
          )
        ) = 'active'

        AND LOWER(
          COALESCE(
            member_type,
            ''
          )
        ) = 'internal'

        AND deleted_at
            IS NULL
    `,
    [
      tenantId,
      userId,
      companyId,
    ],
  );
}


/* ================================================================
   UPDATE SESSION COMPANY CONTEXT
   ================================================================ */

async function updateSessionCompanyContext(
  input: {
    sessionId:
      string;

    userId:
      string;

    tenantId:
      string;

    currentCompanyId:
      string;

    selectedCompanyIds:
      string[];
  },
): Promise<void> {
  const result =
    await queryControl(
      `
        UPDATE sessions

        SET
          current_company_id =
            $4,

          selected_company_ids =
            $5::UUID[],

          updated_at =
            NOW()

        WHERE id = $1
          AND user_id = $2

          AND current_tenant_id =
              $3

          AND is_current =
              TRUE

          AND revoked_at
              IS NULL

          AND expires_at >
              NOW()

        RETURNING id
      `,
      [
        input.sessionId,
        input.userId,
        input.tenantId,
        input.currentCompanyId,
        input.selectedCompanyIds,
      ],
    );


  if (
    result.rows.length !==
      1
  ) {
    throw new CompanyContextError(
      'SESSION_UPDATE_FAILED',
      'The active company context could not be updated.',
    );
  }
}


/* ================================================================
   BUILD / REPAIR TRUSTED COMPANY CONTEXT
   ================================================================ */

export async function requireCompanyContext():
  Promise<TrustedCompanyContext> {
  const session =
    await getSession();


  if (
    !session
  ) {
    throw new CompanyContextError(
      'UNAUTHENTICATED',
      'Authentication is required.',
    );
  }


  if (
    !session.currentTenantId
  ) {
    throw new CompanyContextError(
      'NO_WORKSPACE_SELECTED',
      'No active workspace is selected.',
    );
  }


  /*
   * This revalidates:
   *
   * - session
   * - active internal tenant membership
   * - active workspace
   * - tenant database
   */
  const tenantContext =
    await requireTenantContext();


  const {
    companies:
      allowedCompanies,

    tenantDefaultHint,
  } =
    await loadAllowedCompanies(
      tenantContext.tenantId,
      tenantContext.userId,
    );


  if (
    allowedCompanies.length ===
      0
  ) {
    throw new CompanyContextError(
      'NO_COMPANY_ACCESS',
      'This workspace membership does not have access to any active company.',
    );
  }


  const allowedCompanyIds =
    allowedCompanies.map(
      company =>
        company.id,
    );


  const allowedSet =
    new Set(
      allowedCompanyIds,
    );


  const controlDefaultCompanyId =
    await getControlDefaultCompanyId(
      tenantContext.tenantId,
      tenantContext.userId,
    );


  /*
   * Default company priority:
   *
   * 1. tenant_users.default_company_id
   * 2. historical company_users.is_default hint
   * 3. first allowed company
   */
  let defaultCompanyId:
    string;


  if (
    controlDefaultCompanyId &&
    allowedSet.has(
      controlDefaultCompanyId,
    )
  ) {
    defaultCompanyId =
      controlDefaultCompanyId;
  } else if (
    tenantDefaultHint &&
    allowedSet.has(
      tenantDefaultHint,
    )
  ) {
    defaultCompanyId =
      tenantDefaultHint;
  } else {
    defaultCompanyId =
      allowedCompanyIds[0];
  }


  /*
   * Repair an absent/stale default pointer.
   */
  if (
    controlDefaultCompanyId !==
      defaultCompanyId
  ) {
    await repairDefaultCompanyPointer(
      tenantContext.tenantId,
      tenantContext.userId,
      defaultCompanyId,
    );
  }


  /*
   * The session current company is accepted ONLY if still in
   * the user's allowed-company set.
   */
  let currentCompanyId =
    session.currentCompanyId &&
    allowedSet.has(
      session.currentCompanyId,
    )
      ? session.currentCompanyId
      : defaultCompanyId;


  /*
   * Never trust stored session selection blindly.
   *
   * Revoked or archived companies are removed automatically.
   */
  let selectedCompanyIds =
    normalizeCompanyIds(
      session.selectedCompanyIds,
    )
      .filter(
        companyId =>
          allowedSet.has(
            companyId,
          ),
      );


  /*
   * A session always needs at least one selected company.
   */
  if (
    selectedCompanyIds.length ===
      0
  ) {
    selectedCompanyIds = [
      currentCompanyId,
    ];
  }


  /*
   * Current company must always belong to the selected set.
   */
  if (
    !selectedCompanyIds.includes(
      currentCompanyId,
    )
  ) {
    selectedCompanyIds = [
      currentCompanyId,
      ...selectedCompanyIds,
    ];
  }


  /*
   * Preserve allowed-company ordering for deterministic
   * multi-company behavior.
   */
  selectedCompanyIds =
    allowedCompanyIds.filter(
      companyId =>
        selectedCompanyIds.includes(
          companyId,
        ),
    );


  if (
    !selectedCompanyIds.includes(
      currentCompanyId,
    )
  ) {
    currentCompanyId =
      selectedCompanyIds[0];
  }


  const sessionNeedsRepair =
    session.currentCompanyId !==
      currentCompanyId ||

    !arraysEqual(
      normalizeCompanyIds(
        session.selectedCompanyIds,
      ),

      selectedCompanyIds,
    );


  if (
    sessionNeedsRepair
  ) {
    await updateSessionCompanyContext({
      sessionId:
        tenantContext.sessionId,

      userId:
        tenantContext.userId,

      tenantId:
        tenantContext.tenantId,

      currentCompanyId,

      selectedCompanyIds,
    });
  }


  const companyById =
    new Map(
      allowedCompanies.map(
        company => [
          company.id,
          company,
        ],
      ),
    );


  const currentCompany =
    companyById.get(
      currentCompanyId,
    );


  const defaultCompany =
    companyById.get(
      defaultCompanyId,
    );


  if (
    !currentCompany ||
    !defaultCompany
  ) {
    throw new CompanyContextError(
      'NO_COMPANY_ACCESS',
      'The company context could not be resolved.',
    );
  }


  const selectedCompanies =
    selectedCompanyIds
      .map(
        companyId =>
          companyById.get(
            companyId,
          ),
      )
      .filter(
        (
          company,
        ): company is CompanyContextCompany =>
          Boolean(
            company,
          ),
      );


  return {
    sessionId:
      tenantContext.sessionId,

    userId:
      tenantContext.userId,

    tenantId:
      tenantContext.tenantId,

    defaultCompanyId,

    currentCompanyId,

    selectedCompanyIds,

    allowedCompanyIds,

    defaultCompany,

    currentCompany,

    selectedCompanies,

    allowedCompanies,
  };
}


/* ================================================================
   CURRENT COMPANY
   ================================================================ */

export async function requireCurrentCompanyId():
  Promise<string> {
  const context =
    await requireCompanyContext();


  return context.currentCompanyId;
}


/* ================================================================
   ALLOWED COMPANY IDS
   ================================================================ */

export async function requireAllowedCompanyIds():
  Promise<string[]> {
  const context =
    await requireCompanyContext();


  return [
    ...context.allowedCompanyIds,
  ];
}


/* ================================================================
   SELECTED COMPANY IDS
   ================================================================ */

export async function requireSelectedCompanyIds():
  Promise<string[]> {
  const context =
    await requireCompanyContext();


  return [
    ...context.selectedCompanyIds,
  ];
}


/* ================================================================
   REQUIRE SPECIFIC COMPANY
   ================================================================ */

export async function requireCompanyInContext(
  companyId:
    string,

  options?: {
    requireSelected?:
      boolean;
  },
): Promise<CompanyContextCompany> {
  const normalizedCompanyId =
    requireCompanyId(
      companyId,
    );


  const context =
    await requireCompanyContext();


  const company =
    context.allowedCompanies.find(
      item =>
        item.id ===
        normalizedCompanyId,
    );


  if (
    !company
  ) {
    throw new CompanyContextError(
      'COMPANY_ACCESS_DENIED',
      'You do not have access to this company.',
    );
  }


  if (
    options?.requireSelected ===
      true &&
    !context.selectedCompanyIds
      .includes(
        normalizedCompanyId,
      )
  ) {
    throw new CompanyContextError(
      'COMPANY_ACCESS_DENIED',
      'This company is not enabled in the current working context.',
    );
  }


  return company;
}


/* ================================================================
   SET CURRENT COMPANY
   ================================================================

   Odoo-like behavior:

   Clicking an allowed company's name makes it the current company.

   If it was not selected yet, selecting it as current also enables
   it in the session.

   ================================================================ */

export async function setCurrentCompany(
  companyId:
    string,
): Promise<TrustedCompanyContext> {
  const normalizedCompanyId =
    requireCompanyId(
      companyId,
    );


  const context =
    await requireCompanyContext();


  if (
    !context.allowedCompanyIds
      .includes(
        normalizedCompanyId,
      )
  ) {
    throw new CompanyContextError(
      'COMPANY_ACCESS_DENIED',
      'You do not have access to this company.',
    );
  }


  let selectedCompanyIds =
    [
      ...context.selectedCompanyIds,
    ];


  if (
    !selectedCompanyIds.includes(
      normalizedCompanyId,
    )
  ) {
    selectedCompanyIds.push(
      normalizedCompanyId,
    );
  }


  selectedCompanyIds =
    context.allowedCompanyIds.filter(
      id =>
        selectedCompanyIds.includes(
          id,
        ),
    );


  await updateSessionCompanyContext({
    sessionId:
      context.sessionId,

    userId:
      context.userId,

    tenantId:
      context.tenantId,

    currentCompanyId:
      normalizedCompanyId,

    selectedCompanyIds,
  });


  return requireCompanyContext();
}


/* ================================================================
   SET SELECTED COMPANIES
   ================================================================

   This powers the future Odoo-style checkbox company selector.

   All supplied companies must already belong to the user's
   allowed-company list.

   ================================================================ */

export async function setSelectedCompanies(
  companyIds:
    string[],
): Promise<TrustedCompanyContext> {
  if (
    !Array.isArray(
      companyIds,
    )
  ) {
    throw new CompanyContextError(
      'EMPTY_COMPANY_SELECTION',
      'At least one company must be selected.',
    );
  }


  const normalizedIds =
    normalizeCompanyIds(
      companyIds,
    );


  if (
    normalizedIds.length ===
      0
  ) {
    throw new CompanyContextError(
      'EMPTY_COMPANY_SELECTION',
      'At least one company must be selected.',
    );
  }


  if (
    normalizedIds.length >
      MAX_SELECTED_COMPANIES
  ) {
    throw new CompanyContextError(
      'TOO_MANY_COMPANIES',
      'Too many companies were selected.',
    );
  }


  const context =
    await requireCompanyContext();


  const allowedSet =
    new Set(
      context.allowedCompanyIds,
    );


  for (
    const companyId
    of normalizedIds
  ) {
    if (
      !allowedSet.has(
        companyId,
      )
    ) {
      throw new CompanyContextError(
        'COMPANY_ACCESS_DENIED',
        'One or more selected companies are not available to this user.',
      );
    }
  }


  const selectedCompanyIds =
    context.allowedCompanyIds.filter(
      companyId =>
        normalizedIds.includes(
          companyId,
        ),
    );


  let currentCompanyId =
    context.currentCompanyId;


  /*
   * If the current company was unchecked, choose:
   *
   * 1. default company if still selected
   * 2. otherwise the first selected company
   */
  if (
    !selectedCompanyIds.includes(
      currentCompanyId,
    )
  ) {
    currentCompanyId =
      selectedCompanyIds.includes(
        context.defaultCompanyId,
      )
        ? context.defaultCompanyId
        : selectedCompanyIds[0];
  }


  await updateSessionCompanyContext({
    sessionId:
      context.sessionId,

    userId:
      context.userId,

    tenantId:
      context.tenantId,

    currentCompanyId,

    selectedCompanyIds,
  });


  return requireCompanyContext();
}


/* ================================================================
   SET DEFAULT COMPANY
   ================================================================

   Default company is permanent membership preference.

   It is NOT the same thing as current session company.

   ================================================================ */

export async function setDefaultCompany(
  companyId:
    string,
): Promise<TrustedCompanyContext> {
  const normalizedCompanyId =
    requireCompanyId(
      companyId,
    );


  const context =
    await requireCompanyContext();


  if (
    !context.allowedCompanyIds
      .includes(
        normalizedCompanyId,
      )
  ) {
    throw new CompanyContextError(
      'COMPANY_ACCESS_DENIED',
      'The default company must be one of your allowed companies.',
    );
  }


  /*
   * Control DB is authoritative for default company.
   */
  await queryControl(
    `
      UPDATE tenant_users

      SET
        default_company_id =
          $3,

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND user_id = $2

        AND LOWER(
          COALESCE(
            status,
            ''
          )
        ) = 'active'

        AND LOWER(
          COALESCE(
            member_type,
            ''
          )
        ) = 'internal'

        AND deleted_at
            IS NULL
    `,
    [
      context.tenantId,
      context.userId,
      normalizedCompanyId,
    ],
  );


  /*
   * company_users.is_default remains a tenant-local compatibility
   * mirror.
   *
   * tenant_users.default_company_id remains authoritative.
   */
  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );


  const client =
    await pool.connect();


  try {
    await client.query(
      'BEGIN',
    );


    await client.query(
      `
        UPDATE company_users

        SET
          is_default =
            FALSE,

          updated_at =
            NOW()

        WHERE user_id = $1
      `,
      [
        context.userId,
      ],
    );


    await client.query(
      `
        UPDATE company_users

        SET
          is_default =
            TRUE,

          updated_at =
            NOW()

        WHERE user_id = $1
          AND company_id = $2

          AND LOWER(
            COALESCE(
              status,
              ''
            )
          ) = 'active'
      `,
      [
        context.userId,
        normalizedCompanyId,
      ],
    );


    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original error.
    }


    /*
     * The Control DB value remains authoritative.
     *
     * The tenant-local is_default value is only a compatibility
     * mirror, so failure here must not corrupt the canonical
     * default-company preference.
     */
    console.error(
      '[SaMi] Failed to synchronize tenant-local default company mirror:',
      error,
    );
  } finally {
    client.release();
  }


  return requireCompanyContext();
}


/* ================================================================
   COMPANY SELECTOR
   ================================================================ */

export async function getCompanySelectorState():
  Promise<CompanySelectorState> {
  const context =
    await requireCompanyContext();


  return {
    currentCompanyId:
      context.currentCompanyId,

    defaultCompanyId:
      context.defaultCompanyId,

    selectedCompanyIds:
      [
        ...context.selectedCompanyIds,
      ],

    companies:
      context.allowedCompanies.map(
        company => ({
          ...company,

          isCurrent:
            company.id ===
            context.currentCompanyId,

          isDefault:
            company.id ===
            context.defaultCompanyId,

          isSelected:
            context.selectedCompanyIds
              .includes(
                company.id,
              ),
        }),
      ),
  };
}