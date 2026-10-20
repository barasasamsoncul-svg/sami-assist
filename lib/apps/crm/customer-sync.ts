import 'server-only';

import type { Pool, PoolClient } from 'pg';

type SharedCustomer = {
  id: string;
  customer_type: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  external_crm_contact_id: string | null;
  created_by: string | null;
  updated_at: Date | string;
};

type CrmAccount = {
  id: string;
  account_name: string;
  account_type: string;
  lifecycle_stage: string;
  invoicing_customer_id: string | null;
  updated_at: Date | string;
};

type CrmContact = {
  id: string;
  account_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  preferred_channel: string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : '';
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function nameParts(value: string): { firstName: string; lastName: string } {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  const firstName = (parts.shift() || 'Primary contact').slice(0, 160);
  return { firstName, lastName: parts.join(' ').slice(0, 160) };
}

function preferredChannel(email: string, phone: string): string {
  if (email) return 'email';
  if (phone) return 'phone';
  return 'none';
}

function channelFromCustomer(customer: SharedCustomer): string {
  return preferredChannel(clean(customer.email), clean(customer.phone));
}

async function findAccountForCustomer(
  client: PoolClient,
  companyId: string,
  userId: string,
  customer: SharedCustomer,
): Promise<CrmAccount | null> {
  const linked = await client.query<CrmAccount>(
    [
      'SELECT id, account_name, account_type, lifecycle_stage, invoicing_customer_id, updated_at',
      'FROM public.crm_accounts',
      'WHERE company_id = $1 AND invoicing_customer_id = $2 AND deleted_at IS NULL',
      'LIMIT 1 FOR UPDATE',
    ].join('\n'),
    [companyId, customer.id],
  );

  if (linked.rows[0]) return linked.rows[0];

  const sameName = await client.query<CrmAccount>(
    [
      'SELECT id, account_name, account_type, lifecycle_stage, invoicing_customer_id, updated_at',
      'FROM public.crm_accounts',
      'WHERE company_id = $1 AND LOWER(BTRIM(account_name)) = LOWER(BTRIM($2))',
      'AND deleted_at IS NULL',
      'LIMIT 1 FOR UPDATE',
    ].join('\n'),
    [companyId, customer.name],
  );

  const matching = sameName.rows[0];
  if (matching) {
    // Never bind two separate billing customers to one CRM account, or
    // silently convert an account explicitly classified as a partner/competitor.
    if (matching.invoicing_customer_id && matching.invoicing_customer_id !== customer.id) return null;
    if (!matching.invoicing_customer_id && !['prospect', 'customer'].includes(matching.account_type)) return null;

    if (!matching.invoicing_customer_id) {
      await client.query(
        [
          'UPDATE public.crm_accounts',
          'SET invoicing_customer_id = $1, updated_by = $2',
          'WHERE id = $3 AND company_id = $4 AND invoicing_customer_id IS NULL AND deleted_at IS NULL',
        ].join('\n'),
        [customer.id, userId, matching.id, companyId],
      );
      matching.invoicing_customer_id = customer.id;
    }

    return matching;
  }

  const lifecycleStage = customer.status === 'active' ? 'customer' : 'inactive';
  const inserted = await client.query<CrmAccount>(
    [
      'INSERT INTO public.crm_accounts (',
      '  company_id, account_name, account_type, lifecycle_stage, source, website, email, phone,',
      '  invoicing_customer_id, created_by, updated_by',
      ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)',
      'ON CONFLICT DO NOTHING',
      'RETURNING id, account_name, account_type, lifecycle_stage, invoicing_customer_id, updated_at',
    ].join('\n'),
    [
      companyId,
      customer.name,
      'customer',
      lifecycleStage,
      'invoicing',
      clean(customer.website) || null,
      clean(customer.email) || null,
      clean(customer.phone) || null,
      customer.id,
      userId,
    ],
  );

  if (inserted.rows[0]) return inserted.rows[0];

  // Another request or an existing name uniqueness rule won the race. Re-read
  // and accept only an account linked to this same billing customer.
  const afterConflict = await client.query<CrmAccount>(
    [
      'SELECT id, account_name, account_type, lifecycle_stage, invoicing_customer_id, updated_at',
      'FROM public.crm_accounts',
      'WHERE company_id = $1 AND invoicing_customer_id = $2 AND deleted_at IS NULL',
      'LIMIT 1',
    ].join('\n'),
    [companyId, customer.id],
  );
  return afterConflict.rows[0] || null;
}

async function findPrimaryContact(
  client: PoolClient,
  companyId: string,
  customer: SharedCustomer,
  accountId: string,
): Promise<CrmContact | null> {
  if (customer.external_crm_contact_id) {
    const mapped = await client.query<CrmContact>(
      [
        'SELECT id, account_id, first_name, last_name, email, phone, is_primary, preferred_channel, updated_at, deleted_at',
        'FROM public.crm_contacts',
        'WHERE id = $1 AND company_id = $2',
        'LIMIT 1 FOR UPDATE',
      ].join('\n'),
      [customer.external_crm_contact_id, companyId],
    );

    if (mapped.rows[0]) {
      // A deliberate CRM deletion must not be undone by the next sync.
      if (mapped.rows[0].deleted_at) return null;
      if (mapped.rows[0].account_id && mapped.rows[0].account_id !== accountId) return null;
      return mapped.rows[0];
    }
  }

  const email = clean(customer.email);
  if (!email) return null;

  const byEmail = await client.query<CrmContact>(
    [
      'SELECT id, account_id, first_name, last_name, email, phone, is_primary, preferred_channel, updated_at, deleted_at',
      'FROM public.crm_contacts',
      'WHERE company_id = $1 AND LOWER(BTRIM(email)) = LOWER(BTRIM($2))',
      'AND deleted_at IS NULL',
      'LIMIT 1 FOR UPDATE',
    ].join('\n'),
    [companyId, email],
  );

  const match = byEmail.rows[0];
  if (!match || (match.account_id && match.account_id !== accountId)) return null;
  return match;
}

async function emailBelongsToAnotherContact(
  client: PoolClient,
  companyId: string,
  email: string,
  contactId: string,
): Promise<boolean> {
  if (!email) return false;
  const result = await client.query(
    [
      'SELECT 1',
      'FROM public.crm_contacts',
      'WHERE company_id = $1 AND id <> $2',
      'AND LOWER(BTRIM(email)) = LOWER(BTRIM($3))',
      'AND deleted_at IS NULL',
      'LIMIT 1',
    ].join('\n'),
    [companyId, contactId, email],
  );
  return result.rows.length > 0;
}

/**
 * Keep CRM's relationship records connected to the shared Sales/Invoicing
 * customer master. The sync is company-scoped, idempotent, serialized per
 * company, and never merges records just because their email/name collides.
 */
export async function syncCrmCustomerMaster(
  input: { pool: Pool; companyId: string; userId: string },
): Promise<{ customersSeen: number; accountsLinked: number; contactsLinked: number }> {
  const { pool, companyId, userId } = input;
  const client = await pool.connect();
  let accountsLinked = 0;
  let contactsLinked = 0;

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['sami:crm:shared-customer-sync:' + companyId],
    );

    // Older tenant schemas may predate the cross-module contact reference.
    await client.query(
      'ALTER TABLE public.invoicing_customers ADD COLUMN IF NOT EXISTS external_crm_contact_id UUID',
    );

    const customers = await client.query<SharedCustomer>(
      [
        'SELECT id, customer_type, name, contact_name, email, phone, website, status,',
        '       external_crm_contact_id, created_by, updated_at',
        'FROM public.invoicing_customers',
        'WHERE company_id = $1 AND deleted_at IS NULL',
        'ORDER BY id',
      ].join('\n'),
      [companyId],
    );

    for (const customer of customers.rows) {
      const customerName = clean(customer.name);
      if (!customerName) continue;

      const account = await findAccountForCustomer(client, companyId, userId, {
        ...customer,
        name: customerName,
      });
      if (!account) continue;
      accountsLinked += 1;

      // Reflect newer shared-customer identity details in CRM. CRM-only fields
      // (owner, notes, interactions, health, and saved views) remain CRM-owned.
      if (timestamp(customer.updated_at) > timestamp(account.updated_at)) {
        const duplicateName = await client.query(
          [
            'SELECT 1 FROM public.crm_accounts',
            'WHERE company_id = $1 AND id <> $2',
            'AND LOWER(BTRIM(account_name)) = LOWER(BTRIM($3))',
            'AND deleted_at IS NULL LIMIT 1',
          ].join('\n'),
          [companyId, account.id, customerName],
        );

        await client.query(
          [
            'UPDATE public.crm_accounts',
            'SET account_name = CASE WHEN $3::boolean THEN $4 ELSE account_name END,',
            '    email = $5, phone = $6, website = $7,',
            "    account_type = 'customer',",
            "    lifecycle_stage = CASE WHEN $8 = 'active' THEN 'customer' ELSE 'inactive' END,",
            '    updated_by = $9, updated_at = NOW()',
            'WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
          ].join('\n'),
          [
            account.id,
            companyId,
            duplicateName.rows.length === 0,
            customerName,
            clean(customer.email) || null,
            clean(customer.phone) || null,
            clean(customer.website) || null,
            customer.status,
            userId,
          ],
        );
      }

      const displayName = clean(customer.contact_name) || customerName;
      const hasContactDetails = Boolean(
        clean(customer.contact_name) || clean(customer.email) || clean(customer.phone),
      );
      if (!hasContactDetails) continue;

      let contact = await findPrimaryContact(client, companyId, customer, account.id);

      if (!contact && customer.external_crm_contact_id) {
        const exists = await client.query(
          'SELECT 1 FROM public.crm_contacts WHERE id = $1 AND company_id = $2 LIMIT 1',
          [customer.external_crm_contact_id, companyId],
        );
        // If the mapped record was hard-deleted, remove the stale link so the
        // current shared contact can be recreated. Soft-deleted records are kept
        // mapped and intentionally not recreated.
        if (exists.rows.length === 0) {
          await client.query(
            [
              'UPDATE public.invoicing_customers SET external_crm_contact_id = NULL',
              'WHERE id = $1 AND company_id = $2 AND external_crm_contact_id = $3',
            ].join('\n'),
            [customer.id, companyId, customer.external_crm_contact_id],
          );
          customer.external_crm_contact_id = null;
        } else {
          continue;
        }
      }

      if (!contact) {
        const { firstName, lastName } = nameParts(displayName);
        const inserted = await client.query<CrmContact>(
          [
            'INSERT INTO public.crm_contacts (',
            '  company_id, account_id, first_name, last_name, email, phone,',
            '  contact_role, preferred_channel, is_primary, owner_user_id, created_by, updated_by',
            ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9, $9)',
            'ON CONFLICT DO NOTHING',
            'RETURNING id, account_id, first_name, last_name, email, phone, is_primary, preferred_channel, updated_at, deleted_at',
          ].join('\n'),
          [
            companyId,
            account.id,
            firstName,
            lastName,
            clean(customer.email) || null,
            clean(customer.phone) || null,
            'other',
            channelFromCustomer(customer),
            userId,
          ],
        );

        contact = inserted.rows[0] || null;
        if (!contact) {
          contact = await findPrimaryContact(client, companyId, {
            ...customer,
            external_crm_contact_id: null,
          }, account.id);
        }
      }

      if (!contact || (contact.account_id && contact.account_id !== account.id)) continue;

      if (timestamp(customer.updated_at) > timestamp(contact.updated_at)) {
        const { firstName, lastName } = nameParts(displayName);
        const sourceEmail = clean(customer.email);
        const emailConflict = sourceEmail
          ? await emailBelongsToAnotherContact(client, companyId, sourceEmail, contact.id)
          : false;
        await client.query(
          [
            'UPDATE public.crm_contacts',
            'SET first_name = $3, last_name = $4,',
            '    email = CASE WHEN $5::boolean THEN email ELSE $6 END,',
            '    phone = $7, account_id = $8, is_primary = TRUE,',
            '    preferred_channel = $9, updated_by = $10, updated_at = NOW()',
            'WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
          ].join('\n'),
          [
            contact.id,
            companyId,
            firstName,
            lastName,
            emailConflict,
            sourceEmail || null,
            clean(customer.phone) || null,
            account.id,
            channelFromCustomer(customer),
            userId,
          ],
        );
      } else if (!contact.account_id) {
        await client.query(
          [
            'UPDATE public.crm_contacts',
            'SET account_id = $3, updated_by = $4, updated_at = NOW()',
            'WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
          ].join('\n'),
          [contact.id, companyId, account.id, userId],
        );
      }

      if (customer.external_crm_contact_id !== contact.id) {
        await client.query(
          [
            'UPDATE public.invoicing_customers SET external_crm_contact_id = $1',
            'WHERE id = $2 AND company_id = $3 AND deleted_at IS NULL',
          ].join('\n'),
          [contact.id, customer.id, companyId],
        );
      }
      contactsLinked += 1;
    }

    await client.query('COMMIT');
    return {
      customersSeen: customers.rows.length,
      accountsLinked,
      contactsLinked,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
