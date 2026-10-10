import 'server-only';

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import {
  cleanText,
  nullableText,
  numberInput,
  optionalUuid,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

function fingerprint(quote: Record<string, unknown>, lines: Record<string, unknown>[]) {
  const normalized = {
    quote: Object.fromEntries(
      ['customer_name','customer_email','customer_phone','customer_tax_id','billing_address','shipping_address','quote_date','valid_until','currency','reference','subtotal','discount_total','tax_total','shipping_total','total_amount','margin_amount','margin_percent','notes','terms']
        .map(key => [key, quote[key] ?? null]),
    ),
    lines: lines.map(line => Object.fromEntries(
      ['sort_order','description','sku_snapshot','unit','quantity','unit_price','discount_type','discount_value','discount_amount','tax_rate','tax_amount','subtotal','line_total']
        .map(key => [key, line[key] ?? null]),
    )),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

async function quoteSnapshot(client: PoolClient, companyId: string, quoteId: string, lock = false) {
  const quoteResult = await client.query(
    `SELECT * FROM sales_quotes WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`,
    [quoteId, companyId],
  );
  if (quoteResult.rows.length !== 1) throw new SalesError('QUOTE_NOT_FOUND', 'Quote was not found.');
  const linesResult = await client.query(
    `SELECT sort_order, description, sku_snapshot, unit, quantity, unit_price, discount_type, discount_value, discount_amount, tax_rate, tax_amount, subtotal, line_total
     FROM sales_quote_items WHERE quote_id = $1 AND company_id = $2 ORDER BY sort_order, id`,
    [quoteId, companyId],
  );
  return { quote: quoteResult.rows[0] as Record<string, unknown>, lines: linesResult.rows as Record<string, unknown>[], fingerprint: fingerprint(quoteResult.rows[0], linesResult.rows) };
}

function policyMatches(policy: Record<string, unknown>, quote: Record<string, unknown>) {
  if (policy.currency_code && String(policy.currency_code).toUpperCase() !== String(quote.currency || '').toUpperCase()) return false;
  const total = Number(quote.total_amount || 0);
  const subtotal = Number(quote.subtotal || 0);
  const discountPercent = subtotal > 0 ? Number(quote.discount_total || 0) / subtotal * 100 : 0;
  const marginPercent = quote.margin_percent == null ? null : Number(quote.margin_percent);
  const triggers: boolean[] = [];
  if (policy.min_quote_total != null) triggers.push(total >= Number(policy.min_quote_total));
  if (policy.max_discount_percent != null) triggers.push(discountPercent > Number(policy.max_discount_percent));
  if (policy.min_margin_percent != null) triggers.push(marginPercent == null || marginPercent < Number(policy.min_margin_percent));
  return triggers.some(Boolean);
}

async function currentPolicies(client: PoolClient, companyId: string) {
  const result = await client.query(
    `SELECT * FROM sales_quote_approval_policies
     WHERE company_id = $1 AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY priority ASC, created_at ASC`,
    [companyId],
  );
  return result.rows as Record<string, unknown>[];
}

export async function saveSalesQuoteApprovalPolicy(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.SETTINGS_MANAGE);
  const name = cleanText(input.name, 160);
  if (!name) throw new SalesError('INVALID_INPUT', 'Approval policy name is required.');
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 10) {
    throw new SalesError('INVALID_INPUT', 'Add between 1 and 10 approval steps.');
  }
  const priority = numberInput(input.priority ?? 100, 'Priority', { min: 1, max: 100000 });
  const minTotal = input.minQuoteTotal === '' || input.minQuoteTotal == null ? null : numberInput(input.minQuoteTotal, 'Minimum quote total');
  const maxDiscount = input.maxDiscountPercent === '' || input.maxDiscountPercent == null ? null : numberInput(input.maxDiscountPercent, 'Maximum discount percent', { min: 0, max: 100 });
  const minMargin = input.minMarginPercent === '' || input.minMarginPercent == null ? null : numberInput(input.minMarginPercent, 'Minimum margin percent', { min: 0, max: 100 });
  const currency = cleanText(input.currencyCode, 3).toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new SalesError('INVALID_INPUT', 'Currency must be a three-letter code.');
  if (minTotal == null && maxDiscount == null && minMargin == null) throw new SalesError('INVALID_INPUT', 'Set at least one approval trigger.');
  const steps = input.steps.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SalesError('INVALID_INPUT', 'An approval step is invalid.');
    const step = raw as Record<string, unknown>;
    const userId = optionalUuid(step.approverUserId);
    const roleKey = cleanText(step.approverRoleKey, 120).toLowerCase() || null;
    if (!userId && !roleKey) throw new SalesError('INVALID_INPUT', `Step ${index + 1} needs a user or permission key.`);
    if (roleKey && !/^[a-z0-9][a-z0-9._:-]*$/.test(roleKey)) throw new SalesError('INVALID_INPUT', `Step ${index + 1} permission key is invalid.`);
    const required = numberInput(step.requiredApprovals ?? 1, 'Required approvals', { min: 1, max: 20 });
    if (required > 1 && !roleKey) throw new SalesError('INVALID_INPUT', `Step ${index + 1} needs an approver permission key when more than one approval is required.`);
    return { order: index + 1, userId, roleKey, required };
  });

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const policyId = optionalUuid(input.policyId);
    let savedId = policyId;
    if (policyId) {
      const inUse = await client.query(
        `SELECT 1 FROM sales_quote_approval_requests WHERE company_id=$1 AND policy_id=$2 AND status='pending' LIMIT 1`,
        [context.companyId, policyId],
      );
      if (inUse.rows.length) throw new SalesError('QUOTE_STATE_INVALID', 'This policy has pending quotations. Finish or reject those approvals before changing its steps.');
      const updated = await client.query(
        `UPDATE sales_quote_approval_policies SET name=$3,is_active=$4,priority=$5,min_quote_total=$6,max_discount_percent=$7,min_margin_percent=$8,currency_code=$9,updated_by=$10,updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING id`,
        [policyId, context.companyId, name, input.isActive !== false, priority, minTotal, maxDiscount, minMargin, currency, context.userId],
      );
      if (!updated.rowCount) throw new SalesError('INVALID_INPUT', 'Approval policy was not found.');
    } else {
      const inserted = await client.query(
        `INSERT INTO sales_quote_approval_policies (company_id,name,is_active,priority,min_quote_total,max_discount_percent,min_margin_percent,currency_code,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
        [context.companyId, name, input.isActive !== false, priority, minTotal, maxDiscount, minMargin, currency, context.userId],
      );
      savedId = String(inserted.rows[0].id);
    }
    await client.query('DELETE FROM sales_quote_approval_policy_steps WHERE policy_id=$1 AND company_id=$2', [savedId, context.companyId]);
    for (const step of steps) {
      await client.query(
        `INSERT INTO sales_quote_approval_policy_steps (company_id,policy_id,step_order,approver_user_id,approver_role_key,required_approvals)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [context.companyId, savedId, step.order, step.userId, step.roleKey, step.required],
      );
    }
    await client.query('COMMIT');
    return { id: savedId, name, steps: steps.length };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function getSalesQuoteApprovalData() {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const [policies, queue] = await Promise.all([
    context.pool.query(
      `SELECT p.id,p.name,p.is_active,p.priority,p.min_quote_total,p.max_discount_percent,p.min_margin_percent,p.currency_code,
        COALESCE(json_agg(json_build_object('id',s.id,'stepOrder',s.step_order,'approverUserId',s.approver_user_id,'approverRoleKey',s.approver_role_key,'requiredApprovals',s.required_approvals) ORDER BY s.step_order) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS steps
       FROM sales_quote_approval_policies p LEFT JOIN sales_quote_approval_policy_steps s ON s.policy_id=p.id AND s.company_id=p.company_id
       WHERE p.company_id=$1 AND p.deleted_at IS NULL GROUP BY p.id ORDER BY p.priority,p.created_at`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id AS request_id,r.quote_id,r.policy_id,r.status,r.current_step_order,r.requested_at,r.quote_fingerprint,
        q.quote_number,q.customer_name,q.currency,q.total_amount,p.name AS policy_name,
        COALESCE((SELECT json_agg(json_build_object('stepOrder',d.step_order,'reviewerUserId',d.reviewer_user_id,'decision',d.decision,'reason',d.reason,'decidedAt',d.decided_at) ORDER BY d.step_order,d.decided_at) FROM sales_quote_approval_decisions d WHERE d.request_id=r.id AND d.company_id=r.company_id),'[]'::json) AS decisions
       FROM sales_quote_approval_requests r JOIN sales_quotes q ON q.id=r.quote_id AND q.company_id=r.company_id
       LEFT JOIN sales_quote_approval_policies p ON p.id=r.policy_id
       WHERE r.company_id=$1 AND q.deleted_at IS NULL
       ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.requested_at DESC LIMIT 100`,
      [context.companyId],
    ),
  ]);
  return { policies: policies.rows, requests: queue.rows };
}

export async function requestAdvancedSalesQuoteApproval(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_EDIT);
  const quoteId = requireUuid(input.quoteId, 'Quote');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const snapshot = await quoteSnapshot(client, context.companyId, quoteId, true);
    const quote = snapshot.quote;
    if (String(quote.status) !== 'draft') throw new SalesError('QUOTE_STATE_INVALID', 'Only draft quotations can enter internal approval.');
    if (String(quote.approval_status) === 'pending') {
      const existing = await client.query(
        `SELECT id,status,current_step_order FROM sales_quote_approval_requests WHERE company_id=$1 AND quote_id=$2 AND status='pending' FOR UPDATE`,
        [context.companyId, quoteId],
      );
      let requestId = existing.rows[0]?.id ?? null;
      let currentStepOrder = existing.rows[0]?.current_step_order ?? 1;
      if (!existing.rows.length) {
        const legacyRequest = await client.query(
          `INSERT INTO sales_quote_approval_requests(company_id,quote_id,policy_id,quote_fingerprint,status,current_step_order,requested_by)
           VALUES($1,$2,NULL,$3,'pending',1,$4) RETURNING id,current_step_order`,
          [context.companyId, quoteId, snapshot.fingerprint, quote.approval_requested_by ?? context.userId],
        );
        requestId = legacyRequest.rows[0]?.id ?? null;
        currentStepOrder = legacyRequest.rows[0]?.current_step_order ?? 1;
      }
      await client.query('COMMIT');
      return { id: quoteId, approvalStatus: 'pending', requestId, currentStepOrder };
    }
    if (!['draft','rejected','not_required'].includes(String(quote.approval_status || 'draft'))) throw new SalesError('QUOTE_STATE_INVALID', 'This quotation cannot be submitted for approval from its current state.');
    const matching = (await currentPolicies(client, context.companyId)).find(policy => policyMatches(policy, quote));
    const settings = await client.query(
      'SELECT require_quote_approval,quote_approval_threshold FROM sales_settings WHERE company_id=$1',
      [context.companyId],
    );
    const legacyRequired = settings.rows[0]?.require_quote_approval === true && Number(quote.total_amount || 0) >= Number(settings.rows[0]?.quote_approval_threshold || 0);
    if (!matching && !legacyRequired) {
      await client.query(`UPDATE sales_quotes SET approval_status='not_required',updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`, [quoteId, context.companyId, context.userId]);
      await client.query('COMMIT');
      return { id: quoteId, approvalStatus: 'not_required', requestId: null };
    }
    const stepsResult = matching
      ? await client.query('SELECT * FROM sales_quote_approval_policy_steps WHERE company_id=$1 AND policy_id=$2 ORDER BY step_order', [context.companyId, matching.id])
      : { rows: [{ id: null, step_order: 1, approver_user_id: null, approver_role_key: SALES_PERMISSIONS.QUOTE_INTERNAL_APPROVE, required_approvals: 1 }] };
    const steps = stepsResult.rows as Record<string, unknown>[];
    if (!steps.length) throw new SalesError('INVALID_INPUT', 'The selected approval policy has no configured steps.');
    const request = await client.query(
      `INSERT INTO sales_quote_approval_requests(company_id,quote_id,policy_id,quote_fingerprint,status,current_step_order,requested_by)
       VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING id`,
      [context.companyId, quoteId, matching?.id ?? null, snapshot.fingerprint, Number(steps[0].step_order), context.userId],
    );
    await client.query(
      `UPDATE sales_quotes SET approval_status='pending',approval_requested_at=NOW(),approval_requested_by=$3,approval_rejected_at=NULL,approval_rejected_by=NULL,approval_rejection_reason=NULL,updated_by=$3,updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [quoteId, context.companyId, context.userId],
    );
    await client.query(
      `INSERT INTO sales_quote_approval_history(quote_id,company_id,from_status,to_status,reason,changed_by) VALUES($1,$2,$3,'pending',$4,$5)`,
      [quoteId, context.companyId, String(quote.approval_status || 'draft'), matching ? `Submitted for approval under policy: ${matching.name}` : 'Submitted for internal sales approval', context.userId],
    );
    await client.query(
      `INSERT INTO activities(company_id,user_id,model,record_id,type,content,metadata) VALUES($1,$2,'sales.quote',$3,'sales.quote.approval_requested',$4,$5::jsonb)`,
      [context.companyId, context.userId, quoteId, `Quotation ${quote.quote_number} submitted for approval.`, JSON.stringify({ policyId: matching?.id ?? null, requestId: request.rows[0].id, fingerprint: snapshot.fingerprint })],
    );
    await client.query('COMMIT');
    return { id: quoteId, approvalStatus: 'pending', requestId: request.rows[0].id, currentStepOrder: Number(steps[0].step_order) };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function reviewAdvancedSalesQuoteApproval(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_INTERNAL_APPROVE);
  const quoteId = requireUuid(input.quoteId, 'Quote');
  const decision = cleanText(input.decision, 20).toLowerCase();
  if (!['approve','reject'].includes(decision)) throw new SalesError('INVALID_INPUT', 'Choose approve or reject.');
  const reason = nullableText(input.reason, 2000);
  if (decision === 'reject' && !reason) throw new SalesError('INVALID_INPUT', 'A reason is required when rejecting an approval request.');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const snapshot = await quoteSnapshot(client, context.companyId, quoteId, true);
    const quote = snapshot.quote;
    if (String(quote.status) !== 'draft' || String(quote.approval_status) !== 'pending') throw new SalesError('QUOTE_STATE_INVALID', 'Only pending draft quotation approvals can be reviewed.');
    const requestResult = await client.query(
      `SELECT * FROM sales_quote_approval_requests WHERE company_id=$1 AND quote_id=$2 AND status='pending' FOR UPDATE`,
      [context.companyId, quoteId],
    );
    if (requestResult.rows.length !== 1) throw new SalesError('QUOTE_STATE_INVALID', 'No active approval request exists for this quotation.');
    const request = requestResult.rows[0] as Record<string, unknown>;
    if (String(request.quote_fingerprint) !== snapshot.fingerprint) {
      await client.query(`UPDATE sales_quote_approval_requests SET status='superseded',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2`, [request.id, context.companyId]);
      await client.query(`UPDATE sales_quotes SET approval_status='draft',approval_requested_at=NULL,approval_requested_by=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2`, [quoteId, context.companyId]);
      await client.query('COMMIT');
      throw new SalesError('QUOTE_STATE_INVALID', 'Quotation terms changed after submission. The stale request was closed; submit the updated quotation for approval again.');
    }
    const stepResult = await client.query(
      `SELECT * FROM sales_quote_approval_policy_steps WHERE company_id=$1 AND policy_id=$2 AND step_order=$3`,
      [context.companyId, request.policy_id, request.current_step_order],
    );
    const step = stepResult.rows[0] as Record<string, unknown> | undefined;
    const legacyStep = !request.policy_id;
    if (!step && !legacyStep) throw new SalesError('QUOTE_STATE_INVALID', 'The active approval step is no longer configured.');
    if (step) {
      const userAssigned = step.approver_user_id && String(step.approver_user_id) === context.userId;
      const roleAssigned = step.approver_role_key && (context.permissions.isOwner || context.permissions.permissionSet.has(String(step.approver_role_key)));
      if (!userAssigned && !roleAssigned) throw new SalesError('SALES_PERMISSION_REQUIRED', 'You are not an assigned approver for the current approval step.');
    }
    const existingDecision = await client.query(
      `SELECT 1 FROM sales_quote_approval_decisions WHERE company_id=$1 AND request_id=$2 AND step_order=$3 AND reviewer_user_id=$4`,
      [context.companyId, request.id, request.current_step_order, context.userId],
    );
    if (existingDecision.rows.length) throw new SalesError('QUOTE_STATE_INVALID', 'You have already decided this approval step.');
    const nextDecision = decision === 'approve' ? 'approved' : 'rejected';
    await client.query(
      `INSERT INTO sales_quote_approval_decisions(company_id,request_id,policy_step_id,step_order,reviewer_user_id,decision,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [context.companyId, request.id, step?.id ?? null, request.current_step_order, context.userId, nextDecision, reason],
    );
    if (decision === 'reject') {
      await client.query(`UPDATE sales_quote_approval_requests SET status='rejected',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2`, [request.id, context.companyId]);
      await client.query(
        `UPDATE sales_quotes SET approval_status='rejected',approval_rejected_at=NOW(),approval_rejected_by=$3,approval_rejection_reason=$4,updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [quoteId, context.companyId, context.userId, reason],
      );
      await client.query(`INSERT INTO sales_quote_approval_history(quote_id,company_id,from_status,to_status,reason,changed_by) VALUES($1,$2,'pending','rejected',$3,$4)`, [quoteId, context.companyId, reason, context.userId]);
      await client.query('COMMIT');
      return { id: quoteId, approvalStatus: 'rejected', requestId: request.id };
    }
    const required = step ? Number(step.required_approvals || 1) : 1;
    const approvedCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM sales_quote_approval_decisions WHERE company_id=$1 AND request_id=$2 AND step_order=$3 AND decision='approved'`,
      [context.companyId, request.id, request.current_step_order],
    );
    if (Number(approvedCount.rows[0]?.count || 0) >= required) {
      const allSteps = request.policy_id
        ? await client.query('SELECT step_order FROM sales_quote_approval_policy_steps WHERE company_id=$1 AND policy_id=$2 ORDER BY step_order', [context.companyId, request.policy_id])
        : { rows: [{ step_order: 1 }] };
      const nextStep = (allSteps.rows as Record<string, unknown>[]).find(item => Number(item.step_order) > Number(request.current_step_order));
      if (nextStep) {
        await client.query(`UPDATE sales_quote_approval_requests SET current_step_order=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`, [request.id, context.companyId, nextStep.step_order]);
        await client.query(`INSERT INTO sales_quote_approval_history(quote_id,company_id,from_status,to_status,reason,changed_by) VALUES($1,$2,'pending','pending',$3,$4)`, [quoteId, context.companyId, `Approval step ${request.current_step_order} completed; step ${nextStep.step_order} is now active.`, context.userId]);
        await client.query('COMMIT');
        return { id: quoteId, approvalStatus: 'pending', requestId: request.id, currentStepOrder: Number(nextStep.step_order) };
      }
      await client.query(`UPDATE sales_quote_approval_requests SET status='approved',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2`, [request.id, context.companyId]);
      await client.query(`UPDATE sales_quotes SET approval_status='approved',approved_at=NOW(),approved_by=$3,approval_rejected_at=NULL,approval_rejected_by=NULL,approval_rejection_reason=NULL,updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`, [quoteId, context.companyId, context.userId]);
      await client.query(`INSERT INTO sales_quote_approval_history(quote_id,company_id,from_status,to_status,reason,changed_by) VALUES($1,$2,'pending','approved',$3,$4)`, [quoteId, context.companyId, 'All configured approval steps completed.', context.userId]);
      await client.query('COMMIT');
      return { id: quoteId, approvalStatus: 'approved', requestId: request.id };
    }
    await client.query('COMMIT');
    return { id: quoteId, approvalStatus: 'pending', requestId: request.id, currentStepOrder: Number(request.current_step_order), approvalsReceived: Number(approvedCount.rows[0]?.count || 0), approvalsRequired: required };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}
