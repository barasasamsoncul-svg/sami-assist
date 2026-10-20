import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { CompanyContextError } from '@/lib/auth/company-context';
import { TenantContextError } from '@/lib/auth/tenant-context';
import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 20 * 1024;
const TIMELINE_LIMIT = 50;
const ACCOUNT_LIMIT = 200;
const CONTACT_LIMIT = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERACTION_TYPES = new Set(['call', 'email', 'meeting', 'note', 'task', 'sms', 'whatsapp', 'other']);

class CrmInteractionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'CrmInteractionError';
    this.code = code;
    this.status = status;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

function sameOrigin(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (site === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').trim().slice(0, maxLength)
    : '';
}

function optionalUuid(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new CrmInteractionError('INVALID_INPUT', 'Choose a valid CRM account or contact.');
  }
  return value.trim();
}

function optionalTimestamp(value: unknown, field: string) {
  const raw = cleanText(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new CrmInteractionError('INVALID_INPUT', field + ' must be a valid date and time.');
  }
  return parsed.toISOString();
}

function handleError(error: unknown) {
  if (error instanceof CrmInteractionError) {
    return json({ success: false, code: error.code, error: error.message }, error.status);
  }

  if (error instanceof EnterpriseModuleError) {
    const status =
      error.code === 'MODULE_PERMISSION_REQUIRED' || error.code === 'TABLE_NOT_ALLOWED'
        ? 403
        : error.code === 'MODULE_NOT_INSTALLED' || error.code === 'RECORD_NOT_FOUND'
          ? 404
          : error.code === 'WORKSPACE_SUSPENDED'
            ? 402
            : error.code === 'WORKSPACE_CONTEXT_CHANGED'
              ? 409
              : error.code === 'TABLE_NOT_READY'
                ? 503
                : 400;
    return json({ success: false, code: error.code, error: error.message }, status);
  }

  if (error instanceof CompanyContextError || error instanceof TenantContextError) {
    const statuses: Record<string, number> = {
      UNAUTHENTICATED: 401,
      NO_WORKSPACE_SELECTED: 409,
      WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503,
      NO_COMPANY_ACCESS: 403,
      INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403,
      EMPTY_COMPANY_SELECTION: 400,
      TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };
    return json({
      success: false,
      code: error.code,
      error: error.message,
    }, statuses[error.code] ?? 500);
  }

  console.error('[SaMi CRM interactions] request failed:', error);
  return json({
    success: false,
    code: 'CRM_INTERACTION_FAILED',
    error: 'SaMi could not complete the CRM interaction request.',
  }, 500);
}

async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new CrmInteractionError('REQUEST_TOO_LARGE', 'The interaction request is too large.', 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new CrmInteractionError('INVALID_INPUT', 'Send a valid JSON request.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CrmInteractionError('INVALID_INPUT', 'An interaction request is required.');
  }

  return payload as Record<string, unknown>;
}

async function resolveRelationship(
  pool: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>['pool'],
  companyId: string,
  requestedAccountId: string | null,
  contactId: string | null,
) {
  let accountId = requestedAccountId;

  if (accountId) {
    const account = await pool.query(
      `SELECT id FROM public.crm_accounts
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [accountId, companyId],
    );
    if (account.rows.length !== 1) {
      throw new CrmInteractionError('CRM_ACCOUNT_NOT_FOUND', 'Choose an active CRM account in this company.', 404);
    }
  }

  if (contactId) {
    const contact = await pool.query<{ id: string; account_id: string | null }>(
      `SELECT id, account_id
       FROM public.crm_contacts
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [contactId, companyId],
    );

    if (contact.rows.length !== 1) {
      throw new CrmInteractionError('CRM_CONTACT_NOT_FOUND', 'Choose an active CRM contact in this company.', 404);
    }

    const contactAccountId = contact.rows[0].account_id ? String(contact.rows[0].account_id) : null;
    if (!accountId) {
      accountId = contactAccountId;
    } else if (contactAccountId && contactAccountId !== accountId) {
      throw new CrmInteractionError(
        'CRM_RELATIONSHIP_MISMATCH',
        'The selected contact belongs to a different CRM account.',
      );
    }
  }

  if (!accountId && !contactId) {
    throw new CrmInteractionError('INVALID_INPUT', 'Link the interaction to a CRM account or contact.');
  }

  return { accountId, contactId };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view');
    const accountId = optionalUuid(request.nextUrl.searchParams.get('accountId'));
    const contactId = optionalUuid(request.nextUrl.searchParams.get('contactId'));

    if (accountId || contactId) {
      await resolveRelationship(context.pool, context.companyId, accountId, contactId);
    }

    const interactionsPromise = context.pool.query(
      `SELECT
         i.id, i.account_id, i.contact_id, i.interaction_type, i.subject,
         i.description, i.status, i.occurred_at, i.due_at, i.completed_at,
         i.outcome, i.owner_user_id, i.created_by, i.created_at, i.updated_at,
         a.account_name,
         c.first_name AS contact_first_name,
         c.last_name AS contact_last_name,
         c.do_not_contact AS contact_do_not_contact
       FROM public.crm_interactions i
       LEFT JOIN public.crm_accounts a
         ON a.id = i.account_id
        AND a.company_id = i.company_id
       LEFT JOIN public.crm_contacts c
         ON c.id = i.contact_id
        AND c.company_id = i.company_id
       WHERE i.company_id = $1
         AND i.deleted_at IS NULL
         AND ($2::uuid IS NULL OR i.account_id = $2)
         AND ($3::uuid IS NULL OR i.contact_id = $3)
       ORDER BY COALESCE(i.due_at, i.occurred_at, i.created_at) DESC, i.id DESC
       LIMIT $4`,
      [context.companyId, accountId, contactId, TIMELINE_LIMIT + 1],
    );

    const accountsPromise = context.pool.query(
      `SELECT id, account_name
       FROM public.crm_accounts
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY LOWER(account_name), id
       LIMIT $2`,
      [context.companyId, ACCOUNT_LIMIT + 1],
    );

    const contactsPromise = context.pool.query(
      `SELECT id, account_id, first_name, last_name, email, do_not_contact
       FROM public.crm_contacts
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY LOWER(last_name), LOWER(first_name), id
       LIMIT $2`,
      [context.companyId, CONTACT_LIMIT + 1],
    );

    const [interactionResult, accountsResult, contactsResult] = await Promise.all([
      interactionsPromise,
      accountsPromise,
      contactsPromise,
    ]);

    return json({
      success: true,
      interactions: interactionResult.rows.slice(0, TIMELINE_LIMIT),
      hasMore: interactionResult.rows.length > TIMELINE_LIMIT,
      accounts: accountsResult.rows.slice(0, ACCOUNT_LIMIT),
      accountsTruncated: accountsResult.rows.length > ACCOUNT_LIMIT,
      contacts: contactsResult.rows.slice(0, CONTACT_LIMIT),
      contactsTruncated: contactsResult.rows.length > CONTACT_LIMIT,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  }

  try {
    const body = await parseBody(request);
    const interactionType = cleanText(body.interactionType, 20).toLowerCase() || 'note';
    const subject = cleanText(body.subject, 255);
    const description = cleanText(body.description, 8000);
    const outcome = cleanText(body.outcome, 255);
    const status = cleanText(body.status, 20).toLowerCase() || 'completed';

    if (!INTERACTION_TYPES.has(interactionType)) {
      throw new CrmInteractionError('INVALID_INPUT', 'Choose a supported interaction type.');
    }
    if (!subject) {
      throw new CrmInteractionError('INVALID_INPUT', 'An interaction subject is required.');
    }
    if (!['planned', 'completed', 'cancelled'].includes(status)) {
      throw new CrmInteractionError('INVALID_INPUT', 'Choose a valid interaction status.');
    }

    const requestedAccountId = optionalUuid(body.accountId);
    const contactId = optionalUuid(body.contactId);
    const dueAt = optionalTimestamp(body.dueAt, 'Follow-up due date');
    const suppliedOccurredAt = optionalTimestamp(body.occurredAt, 'Interaction date');

    if (status === 'planned' && !dueAt) {
      throw new CrmInteractionError('INVALID_INPUT', 'Planned follow-ups need a due date and time.');
    }

    const context = await requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'create');
    const relationship = await resolveRelationship(
      context.pool,
      context.companyId,
      requestedAccountId,
      contactId,
    );

    const created = await context.pool.query<{ id: string }>(
      `INSERT INTO public.crm_interactions (
         company_id, account_id, contact_id, interaction_type, subject,
         description, status, occurred_at, due_at, completed_at, outcome,
         owner_user_id, created_by, updated_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $7 = 'completed' THEN COALESCE($8::timestamptz, NOW()) ELSE $8::timestamptz END,
         $9::timestamptz,
         CASE WHEN $7 = 'completed' THEN NOW() ELSE NULL END,
         $10, $11, $11, $11
       )
       RETURNING id`,
      [
        context.companyId,
        relationship.accountId,
        relationship.contactId,
        interactionType,
        subject,
        description || null,
        status,
        suppliedOccurredAt,
        dueAt,
        outcome || null,
        context.userId,
      ],
    );

    return json({ success: true, interactionId: String(created.rows[0].id) }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({ success: false, code: 'CROSS_ORIGIN_REQUEST', error: 'This action must come from the SaMi workspace.' }, 403);
  }

  try {
    const body = await parseBody(request);
    const interactionId = cleanText(body.interactionId, 64);
    const nextStatus = cleanText(body.status, 20).toLowerCase();
    const outcome = cleanText(body.outcome, 255);

    if (!UUID_RE.test(interactionId) || !['completed', 'cancelled'].includes(nextStatus)) {
      throw new CrmInteractionError('INVALID_INPUT', 'Choose a valid planned interaction and outcome.');
    }

    const context = await requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit');
    const result = await context.pool.query(
      `UPDATE public.crm_interactions
       SET
         status = $3,
         outcome = COALESCE(NULLIF($4, ''), outcome),
         occurred_at = CASE WHEN $3 = 'completed' THEN COALESCE(occurred_at, NOW()) ELSE occurred_at END,
         completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END,
         updated_by = $5,
         updated_at = NOW()
       WHERE id = $1
         AND company_id = $2
         AND deleted_at IS NULL
         AND status = 'planned'
       RETURNING id, status`,
      [interactionId, context.companyId, nextStatus, outcome, context.userId],
    );

    if (result.rows.length !== 1) {
      throw new CrmInteractionError(
        'INTERACTION_NOT_PENDING',
        'This interaction is no longer pending. Refresh the timeline and try again.',
        409,
      );
    }

    return json({ success: true, interactionId, status: nextStatus });
  } catch (error) {
    return handleError(error);
  }
}
