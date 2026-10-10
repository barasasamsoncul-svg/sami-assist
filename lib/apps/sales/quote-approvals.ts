import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  money,
  nullableText,
  numberInput,
  optionalUuid,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
  UUID_RE,
} from '@/lib/apps/sales/context';

import {
  queryControl,
} from '@/lib/db/control';


type SalesContext =
  Awaited<ReturnType<typeof requireSalesContext>>;

type WorkflowStepSnapshot = {
  stepNumber: number;
  stepName: string;
  approverUserId: string;
  approverName: string;
  approverEmail: string | null;
};

function hasPermission(
  context: SalesContext,
  permission: string,
) {
  return context.permissions.isOwner ||
    context.permissions.permissionSet.has(permission);
}

function parseSnapshot(value: unknown): WorkflowStepSnapshot[] {
  let parsed = value;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, index) => ({
    stepNumber: Number(item?.stepNumber || index + 1),
    stepName: String(item?.stepName || 'Approval step ' + (index + 1)),
    approverUserId: String(item?.approverUserId || ''),
    approverName: String(item?.approverName || 'Workspace member'),
    approverEmail: item?.approverEmail ? String(item.approverEmail) : null,
  }));
}

async function getInternalWorkspaceUsers(
  tenantId: string,
  userIds?: string[],
) {
  const uniqueIds = userIds
    ? Array.from(new Set(userIds.map(id => id.toLowerCase())))
    : null;

  if (uniqueIds && uniqueIds.length === 0) return [];

  if (
    uniqueIds &&
    (
      uniqueIds.length > 250 ||
      uniqueIds.some(id => !UUID_RE.test(id))
    )
  ) {
    throw new SalesError('INVALID_INPUT', 'Choose valid workspace users.');
  }

  const result = await queryControl(
    \`
      SELECT
        u.id,
        COALESCE(
          NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
          NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
          u.email
        ) AS name,
        u.email,
        u.avatar_url,
        tu.is_owner
      FROM tenant_users tu
      INNER JOIN users u
        ON u.id = tu.user_id
      WHERE tu.tenant_id = $1
        AND ($2::uuid[] IS NULL OR tu.user_id = ANY($2::uuid[]))
        AND tu.status = 'active'
        AND tu.member_type = 'internal'
        AND tu.deleted_at IS NULL
        AND u.deleted_at IS NULL
      ORDER BY
        tu.is_owner DESC,
        LOWER(COALESCE(u.full_name, u.email)),
        u.id
    \`,
    [tenantId, uniqueIds],
  );

  return result.rows.map(row => ({
    id: String(row.id),
    name: String(row.name || row.email || 'Workspace member'),
    email: row.email ? String(row.email) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    isOwner: row.is_owner === true,
  }));
}

async function requireActiveWorkspaceUsers(
  tenantId: string,
  userIds: string[],
) {
  const unique = Array.from(new Set(userIds.map(id => id.toLowerCase())));

  if (
    unique.length < 1 ||
    unique.length > 10 ||
    unique.some(id => !UUID_RE.test(id))
  ) {
    throw new SalesError('INVALID_INPUT', 'Choose between one and ten valid approvers.');
  }

  if (unique.length !== userIds.length) {
    throw new SalesError('INVALID_INPUT', 'Each approval step must have a different approver.');
  }

  const users = await getInternalWorkspaceUsers(tenantId, unique);
  const found = new Set(users.map(user => user.id.toLowerCase()));

  if (unique.some(id => !found.has(id))) {
    throw new SalesError(
      'INVALID_INPUT',
      'Every approver must be an active internal member of this workspace.',
    );
  }

  return users;
}

export async function hasMatchingSalesQuoteApprovalPolicy(
  client: PoolClient,
  companyId: string,
  baseTotalAmount: number,
) {
  const result = await client.query(
    \`
      SELECT EXISTS (
        SELECT 1
        FROM sales_quote_approval_policies policy
        WHERE policy.company_id = $1
          AND policy.is_active = TRUE
          AND policy.deleted_at IS NULL
          AND policy.min_base_amount <= $2
          AND (
            policy.max_base_amount IS NULL
            OR policy.max_base_amount >= $2
          )
          AND EXISTS (
            SELECT 1
            FROM sales_quote_approval_policy_steps step
            WHERE step.policy_id = policy.id
              AND step.company_id = policy.company_id
          )
      ) AS required
    \`,
    [companyId, baseTotalAmount],
  );

  return result.rows[0]?.required === true;
}

export async function getActiveSalesQuoteApprovalRequest(
  client: PoolClient,
  companyId: string,
  quoteId: string,
) {
  const result = await client.query(
    \`
      SELECT
        id,
        policy_id,
        current_step_number,
        current_approver_user_id,
        step_snapshot,
        requested_at
      FROM sales_quote_approval_requests
      WHERE company_id = $1
        AND quote_id = $2
        AND status = 'pending'
      LIMIT 1
      FOR UPDATE
    \`,
    [companyId, quoteId],
  );

  if (!result.rows.length) return null;

  const row = result.rows[0];
  const steps = parseSnapshot(row.step_snapshot);
  const currentStepNumber = Number(row.current_step_number);

  return {
    id: String(row.id),
    policyId: row.policy_id ? String(row.policy_id) : null,
    currentStepNumber,
    currentApproverUserId: row.current_approver_user_id
      ? String(row.current_approver_user_id)
      : null,
    currentStepName: steps[currentStepNumber - 1]?.stepName || null,
    totalSteps: steps.length,
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
  };
}

export async function startSalesQuoteApprovalWorkflow(
  client: PoolClient,
  context: SalesContext,
  quoteId: string,
  quoteRow: Record<string, unknown>,
  fromStatus: string,
) {
  const baseTotalAmount = money(quoteRow.base_total_amount);
  const selected = await client.query(
    \`
      SELECT policy.id, policy.name
      FROM sales_quote_approval_policies policy
      WHERE policy.company_id = $1
        AND policy.is_active = TRUE
        AND policy.deleted_at IS NULL
        AND policy.min_base_amount <= $2
        AND (
          policy.max_base_amount IS NULL
          OR policy.max_base_amount >= $2
        )
        AND EXISTS (
          SELECT 1
          FROM sales_quote_approval_policy_steps step
          WHERE step.policy_id = policy.id
            AND step.company_id = policy.company_id
        )
      ORDER BY
        policy.priority ASC,
        policy.min_base_amount DESC,
        policy.created_at ASC,
        policy.id ASC
      LIMIT 1
    \`,
    [context.companyId, baseTotalAmount],
  );

  if (!selected.rows.length) return null;

  const policy = selected.rows[0];
  const stepsResult = await client.query(
    \`
      SELECT step_number, step_name, approver_user_id
      FROM sales_quote_approval_policy_steps
      WHERE company_id = $1
        AND policy_id = $2
      ORDER BY step_number ASC
    \`,
    [context.companyId, policy.id],
  );

  const configured = stepsResult.rows.map(row => ({
    stepNumber: Number(row.step_number),
    stepName: String(row.step_name),
    approverUserId: String(row.approver_user_id),
  }));

  if (
    configured.length < 1 ||
    configured.length > 10 ||
    configured.some((step, index) => step.stepNumber !== index + 1)
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'The selected quote approval policy has an invalid step sequence. Review the policy in Sales settings.',
    );
  }

  const users = await requireActiveWorkspaceUsers(
    context.tenantId,
    configured.map(step => step.approverUserId),
  );
  const userById = new Map(users.map(user => [user.id.toLowerCase(), user]));

  const snapshot: WorkflowStepSnapshot[] = configured.map(step => {
    const user = userById.get(step.approverUserId.toLowerCase());
    if (!user) {
      throw new SalesError(
        'INVALID_INPUT',
        'An approver is no longer an active internal workspace member.',
      );
    }

    return {
      ...step,
      approverName: user.name,
      approverEmail: user.email,
    };
  });

  const inserted = await client.query(
    \`
      INSERT INTO sales_quote_approval_requests (
        company_id,
        quote_id,
        policy_id,
        status,
        requested_by,
        requested_at,
        current_step_number,
        current_approver_user_id,
        quote_revision,
        quote_total_amount,
        quote_base_total_amount,
        base_currency,
        step_snapshot,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, 'pending', $4, NOW(), 1, $5,
        $6, $7, $8, $9, $10::jsonb, $4, $4
      )
      RETURNING id, requested_at
    \`,
    [
      context.companyId,
      quoteId,
      policy.id,
      context.userId,
      snapshot[0].approverUserId,
      Math.max(1, Number(quoteRow.current_revision || 1)),
      money(quoteRow.total_amount),
      baseTotalAmount,
      String(quoteRow.base_currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
      JSON.stringify(snapshot),
    ],
  );

  const request = inserted.rows[0];
  await client.query(
    \`
      UPDATE sales_quotes
      SET
        approval_status = 'pending',
        approval_workflow_request_id = $3,
        approval_requested_at = NOW(),
        approval_requested_by = $4,
        approved_at = NULL,
        approved_by = NULL,
        approval_rejected_at = NULL,
        approval_rejected_by = NULL,
        approval_rejection_reason = NULL,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1 AND company_id = $2
    \`,
    [quoteId, context.companyId, request.id, context.userId],
  );

  await client.query(
    \`
      INSERT INTO sales_quote_approval_history (
        quote_id, company_id, from_status, to_status, reason, changed_by
      )
      VALUES ($1, $2, $3, 'pending', $4, $5)
    \`,
    [
      quoteId,
      context.companyId,
      fromStatus,
      'Submitted under approval policy "' + String(policy.name) + '" (' +
        snapshot.length + ' sequential step' + (snapshot.length === 1 ? '' : 's') + ').',
      context.userId,
    ],
  );

  return {
    id: quoteId,
    approvalStatus: 'pending',
    requestId: String(request.id),
    currentStepNumber: 1,
    currentStepName: snapshot[0].stepName,
    currentApproverUserId: snapshot[0].approverUserId,
    totalSteps: snapshot.length,
    requestedAt: new Date(request.requested_at).toISOString(),
  };
}

export async function reviewSalesQuoteApprovalStep(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS.QUOTE_INTERNAL_APPROVE,
  );
  const requestId = requireUuid(input.requestId, 'Approval request');
  const quoteIdInput = optionalUuid(input.quoteId);
  const stepNumber = Number(input.stepNumber);
  const decision = cleanText(input.decision, 20).toLowerCase();
  const note = nullableText(input.reason ?? input.note, 2000);

  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid approval step.');
  }
  if (decision !== 'approve' && decision !== 'reject') {
    throw new SalesError('INVALID_INPUT', 'Choose approve or reject.');
  }
  if (decision === 'reject' && !note) {
    throw new SalesError('INVALID_INPUT', 'A reason is required when rejecting an approval step.');
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');

    const requestReference = await client.query(
      \`
        SELECT quote_id
        FROM sales_quote_approval_requests
        WHERE id = $1 AND company_id = $2
        LIMIT 1
      \`,
      [requestId, context.companyId],
    );

    if (!requestReference.rows.length) {
      throw new SalesError('QUOTE_NOT_FOUND', 'Approval request was not found.');
    }

    const quoteId = String(requestReference.rows[0].quote_id);
    if (quoteIdInput && quoteIdInput !== quoteId) {
      throw new SalesError('INVALID_INPUT', 'The approval request does not belong to the selected quotation.');
    }

    const quoteResult = await client.query(
      \`
        SELECT id, quote_number, status, approval_status, current_revision,
               approval_workflow_request_id
        FROM sales_quotes
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      \`,
      [quoteId, context.companyId],
    );
    if (!quoteResult.rows.length) {
      throw new SalesError('QUOTE_NOT_FOUND', 'Quote was not found.');
    }

    const requestResult = await client.query(
      \`
        SELECT *
        FROM sales_quote_approval_requests
        WHERE id = $1 AND company_id = $2 AND quote_id = $3
        FOR UPDATE
      \`,
      [requestId, context.companyId, quoteId],
    );
    if (!requestResult.rows.length) {
      throw new SalesError('QUOTE_NOT_FOUND', 'Approval request was not found.');
    }

    const quote = quoteResult.rows[0];
    const request = requestResult.rows[0];
    if (String(request.status) !== 'pending') {
      throw new SalesError('QUOTE_STATE_INVALID', 'This approval request has already been completed.');
    }
    if (String(request.current_approver_user_id || '') !== context.userId) {
      throw new SalesError('SALES_PERMISSION_REQUIRED', 'Only the assigned approver can decide this step.');
    }
    if (Number(request.current_step_number) !== stepNumber) {
      throw new SalesError('QUOTE_STATE_INVALID', 'This approval step is out of date. Refresh the queue and try again.');
    }
    if (
      String(quote.status) !== 'draft' ||
      String(quote.approval_status) !== 'pending' ||
      String(quote.approval_workflow_request_id || '') !== requestId ||
      Number(quote.current_revision || 1) !== Number(request.quote_revision)
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'The quotation changed after this approval request. Withdraw or refresh the request before reviewing it.',
      );
    }

    const snapshot = parseSnapshot(request.step_snapshot);
    const activeStep = snapshot[stepNumber - 1];
    if (!activeStep || activeStep.approverUserId !== context.userId) {
      throw new SalesError('QUOTE_STATE_INVALID', 'The configured approval step is invalid.');
    }

    const outcome = decision === 'approve' ? 'approved' : 'rejected';
    await client.query(
      \`
        INSERT INTO sales_quote_approval_decisions (
          company_id, request_id, quote_id, step_number, step_name,
          approver_user_id, decision, note, decided_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      \`,
      [
        context.companyId,
        requestId,
        quoteId,
        stepNumber,
        activeStep.stepName,
        context.userId,
        outcome,
        note,
      ],
    );

    if (outcome === 'rejected') {
      await client.query(
        \`
          UPDATE sales_quote_approval_requests
          SET status = 'rejected', current_approver_user_id = NULL,
              completed_at = NOW(), updated_by = $3, updated_at = NOW()
          WHERE id = $1 AND company_id = $2
        \`,
        [requestId, context.companyId, context.userId],
      );
      await client.query(
        \`
          UPDATE sales_quotes
          SET approval_status = 'rejected',
              approval_rejected_at = NOW(),
              approval_rejected_by = $3,
              approval_rejection_reason = $4,
              updated_by = $3,
              updated_at = NOW()
          WHERE id = $1 AND company_id = $2
        \`,
        [quoteId, context.companyId, context.userId, note],
      );
    } else {
      const nextStep = snapshot[stepNumber];
      if (nextStep) {
        await client.query(
          \`
            UPDATE sales_quote_approval_requests
            SET current_step_number = $3, current_approver_user_id = $4,
                updated_by = $5, updated_at = NOW()
            WHERE id = $1 AND company_id = $2
          \`,
          [requestId, context.companyId, nextStep.stepNumber, nextStep.approverUserId, context.userId],
        );
      } else {
        await client.query(
          \`
            UPDATE sales_quote_approval_requests
            SET status = 'approved', current_approver_user_id = NULL,
                completed_at = NOW(), updated_by = $3, updated_at = NOW()
            WHERE id = $1 AND company_id = $2
          \`,
          [requestId, context.companyId, context.userId],
        );
        await client.query(
          \`
            UPDATE sales_quotes
            SET approval_status = 'approved',
                approved_at = NOW(),
                approved_by = $3,
                approval_rejected_at = NULL,
                approval_rejected_by = NULL,
                approval_rejection_reason = NULL,
                updated_by = $3,
                updated_at = NOW()
            WHERE id = $1 AND company_id = $2
          \`,
          [quoteId, context.companyId, context.userId],
        );
      }
    }

    const isFinal = outcome === 'rejected' || stepNumber === snapshot.length;
    const historyStatus = outcome === 'rejected'
      ? 'rejected'
      : isFinal
        ? 'approved'
        : 'pending';
    const historyReason = outcome === 'rejected'
      ? 'Step ' + stepNumber + ' (' + activeStep.stepName + ') rejected: ' + note
      : isFinal
        ? 'Final approval step completed by ' + activeStep.approverName + '.'
        : 'Step ' + stepNumber + ' approved by ' + activeStep.approverName +
          '; advanced to step ' + snapshot[stepNumber].stepNumber + ' (' +
          snapshot[stepNumber].stepName + ').';

    await client.query(
      \`
        INSERT INTO sales_quote_approval_history (
          quote_id, company_id, from_status, to_status, reason, changed_by
        )
        VALUES ($1, $2, 'pending', $3, $4, $5)
      \`,
      [quoteId, context.companyId, historyStatus, historyReason, context.userId],
    );

    await client.query('COMMIT');

    return {
      id: quoteId,
      requestId,
      approvalStatus: historyStatus,
      decision: outcome,
      stepNumber,
      nextStepNumber: outcome === 'approved' ? snapshot[stepNumber]?.stepNumber || null : null,
      completed: isFinal,
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

export async function saveSalesQuoteApprovalPolicy(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.SETTINGS_MANAGE);
  const id = optionalUuid(input.id);
  const name = cleanText(input.name, 180);
  if (!name) throw new SalesError('INVALID_INPUT', 'Approval policy name is required.');

  const priority = numberInput(input.priority ?? 100, 'Priority', { min: 1, max: 100000 });
  if (!Number.isInteger(priority)) {
    throw new SalesError('INVALID_INPUT', 'Priority must be a whole number.');
  }

  const minBaseAmount = numberInput(input.minBaseAmount ?? 0, 'Minimum amount', { min: 0 });
  const rawMax = input.maxBaseAmount;
  const maxBaseAmount = rawMax === undefined || rawMax === null || String(rawMax).trim() === ''
    ? null
    : numberInput(rawMax, 'Maximum amount', { min: minBaseAmount });

  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (rawSteps.length < 1 || rawSteps.length > 10) {
    throw new SalesError('INVALID_INPUT', 'An approval policy must have between one and ten steps.');
  }

  const steps = rawSteps.map((raw, index) => {
    const item = raw as Record<string, unknown>;
    const stepName = cleanText(item.stepName ?? item.name, 120) || 'Approval step ' + (index + 1);
    const approverUserId = optionalUuid(item.approverUserId);
    if (!approverUserId) {
      throw new SalesError('INVALID_INPUT', 'Assign an approver to every approval step.');
    }
    return {
      stepNumber: index + 1,
      stepName,
      approverUserId,
    };
  });

  if (new Set(steps.map(step => step.approverUserId.toLowerCase())).size !== steps.length) {
    throw new SalesError('INVALID_INPUT', 'Each approval step must have a different approver.');
  }

  await requireActiveWorkspaceUsers(context.tenantId, steps.map(step => step.approverUserId));

  const duplicate = await context.pool.query(
    \`
      SELECT 1
      FROM sales_quote_approval_policies
      WHERE company_id = $1
        AND LOWER(BTRIM(name)) = LOWER(BTRIM($2))
        AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1
    \`,
    [context.companyId, name, id],
  );
  if (duplicate.rows.length) {
    throw new SalesError('INVALID_INPUT', 'An approval policy with this name already exists.');
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    let policyId = id;

    if (policyId) {
      const updated = await client.query(
        \`
          UPDATE sales_quote_approval_policies
          SET name = $3, priority = $4, min_base_amount = $5,
              max_base_amount = $6, is_active = $7,
              updated_by = $8, updated_at = NOW()
          WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
          RETURNING id
        \`,
        [
          policyId,
          context.companyId,
          name,
          priority,
          minBaseAmount,
          maxBaseAmount,
          input.isActive !== false,
          context.userId,
        ],
      );
      if (!updated.rows.length) {
        throw new SalesError('INVALID_INPUT', 'Approval policy was not found.');
      }
    } else {
      const inserted = await client.query(
        \`
          INSERT INTO sales_quote_approval_policies (
            company_id, name, priority, min_base_amount, max_base_amount,
            is_active, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          RETURNING id
        \`,
        [
          context.companyId,
          name,
          priority,
          minBaseAmount,
          maxBaseAmount,
          input.isActive !== false,
          context.userId,
        ],
      );
      policyId = String(inserted.rows[0].id);
    }

    await client.query(
      \`DELETE FROM sales_quote_approval_policy_steps WHERE policy_id = $1 AND company_id = $2\`,
      [policyId, context.companyId],
    );

    for (const step of steps) {
      await client.query(
        \`
          INSERT INTO sales_quote_approval_policy_steps (
            company_id, policy_id, step_number, step_name, approver_user_id
          )
          VALUES ($1, $2, $3, $4, $5)
        \`,
        [context.companyId, policyId, step.stepNumber, step.stepName, step.approverUserId],
      );
    }

    await client.query('COMMIT');
    return { id: policyId, name, stepCount: steps.length };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateSalesQuoteApprovalPolicy(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.SETTINGS_MANAGE);
  const id = requireUuid(input.id, 'Approval policy');
  const result = await context.pool.query(
    \`
      UPDATE sales_quote_approval_policies
      SET is_active = FALSE, updated_by = $3, updated_at = NOW()
      WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
      RETURNING id
    \`,
    [id, context.companyId, context.userId],
  );
  if (!result.rows.length) {
    throw new SalesError('INVALID_INPUT', 'Approval policy was not found.');
  }
  return { id, isActive: false };
}

export async function getSalesQuoteApprovalWorkflowData() {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canManagePolicies = hasPermission(context, SALES_PERMISSIONS.SETTINGS_MANAGE);
  const canReview = hasPermission(context, SALES_PERMISSIONS.QUOTE_INTERNAL_APPROVE);

  const policyRows = canManagePolicies
    ? await context.pool.query(
        \`
          SELECT
            policy.id, policy.name, policy.priority,
            policy.min_base_amount, policy.max_base_amount,
            policy.is_active, policy.created_at, policy.updated_at,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'stepNumber', step.step_number,
                  'stepName', step.step_name,
                  'approverUserId', step.approver_user_id
                )
                ORDER BY step.step_number
              ) FILTER (WHERE step.id IS NOT NULL),
              '[]'::jsonb
            ) AS steps
          FROM sales_quote_approval_policies policy
          LEFT JOIN sales_quote_approval_policy_steps step
            ON step.policy_id = policy.id
           AND step.company_id = policy.company_id
          WHERE policy.company_id = $1
            AND policy.deleted_at IS NULL
          GROUP BY policy.id
          ORDER BY policy.priority ASC, policy.min_base_amount DESC, LOWER(policy.name)
          LIMIT 100
        \`,
        [context.companyId],
      )
    : { rows: [] };

  const pending = canReview
    ? await context.pool.query(
        \`
          SELECT
            request.id, request.quote_id, request.policy_id,
            request.requested_by, request.requested_at,
            request.current_step_number, request.current_approver_user_id,
            request.quote_revision, request.quote_total_amount,
            request.quote_base_total_amount, request.base_currency,
            request.step_snapshot,
            quote.quote_number, quote.customer_name, quote.currency,
            request.step_snapshot -> (request.current_step_number - 1) ->> 'stepName'
              AS current_step_name,
            jsonb_array_length(request.step_snapshot) AS total_steps
          FROM sales_quote_approval_requests request
          INNER JOIN sales_quotes quote
            ON quote.id = request.quote_id
           AND quote.company_id = request.company_id
          WHERE request.company_id = $1
            AND request.status = 'pending'
            AND request.current_approver_user_id = $2
            AND quote.deleted_at IS NULL
          ORDER BY request.requested_at ASC, request.id
          LIMIT 100
        \`,
        [context.companyId, context.userId],
      )
    : { rows: [] };

  const requestIds = pending.rows.map(row => String(row.id));
  const decisionRows = requestIds.length
    ? await context.pool.query(
        \`
          SELECT request_id, step_number, step_name, approver_user_id,
                 decision, note, decided_at
          FROM sales_quote_approval_decisions
          WHERE company_id = $1 AND request_id = ANY($2::uuid[])
          ORDER BY request_id, step_number
        \`,
        [context.companyId, requestIds],
      )
    : { rows: [] };

  const userIds = new Set<string>();
  for (const row of policyRows.rows) {
    for (const step of parseSnapshot(row.steps)) userIds.add(step.approverUserId);
  }
  for (const row of pending.rows) {
    userIds.add(String(row.requested_by));
    for (const step of parseSnapshot(row.step_snapshot)) userIds.add(step.approverUserId);
  }
  for (const row of decisionRows.rows) userIds.add(String(row.approver_user_id));

  const directory = await getInternalWorkspaceUsers(context.tenantId, Array.from(userIds));
  const userById = new Map(directory.map(user => [user.id.toLowerCase(), user]));

  const mappedPolicies = policyRows.rows.map(row => {
    const steps = parseSnapshot(row.steps).map(step => {
      const user = userById.get(step.approverUserId.toLowerCase());
      return {
        ...step,
        approverName: user?.name || 'Workspace member',
        approverEmail: user?.email || null,
      };
    });
    return {
      id: String(row.id),
      name: String(row.name),
      priority: Number(row.priority),
      minBaseAmount: money(row.min_base_amount),
      maxBaseAmount: row.max_base_amount === null ? null : money(row.max_base_amount),
      isActive: row.is_active === true,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      steps,
    };
  });

  const decisionsByRequest = new Map<string, Array<Record<string, unknown>>>();
  for (const row of decisionRows.rows) {
    const requestId = String(row.request_id);
    const user = userById.get(String(row.approver_user_id).toLowerCase());
    const list = decisionsByRequest.get(requestId) || [];
    list.push({
      stepNumber: Number(row.step_number),
      stepName: String(row.step_name),
      approverUserId: String(row.approver_user_id),
      approverName: user?.name || 'Former workspace member',
      decision: String(row.decision),
      note: row.note ? String(row.note) : null,
      decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    });
    decisionsByRequest.set(requestId, list);
  }

  const queue = pending.rows.map(row => {
    const snapshot = parseSnapshot(row.step_snapshot);
    return {
      id: String(row.id),
      quoteId: String(row.quote_id),
      quoteNumber: String(row.quote_number),
      customerName: String(row.customer_name),
      currency: String(row.currency || row.base_currency),
      totalAmount: money(row.quote_total_amount),
      baseCurrency: String(row.base_currency),
      baseTotalAmount: money(row.quote_base_total_amount),
      requestedBy: String(row.requested_by),
      requestedByName: userById.get(String(row.requested_by).toLowerCase())?.name || 'Workspace member',
      requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
      currentStepNumber: Number(row.current_step_number),
      currentStepName: String(row.current_step_name || 'Approval step'),
      totalSteps: Number(row.total_steps),
      currentApproverUserId: String(row.current_approver_user_id),
      decisions: decisionsByRequest.get(String(row.id)) || [],
      steps: snapshot,
    };
  });

  const approvers = canManagePolicies
    ? directory.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        isOwner: user.isOwner,
      }))
    : [];

  return {
    success: true,
    canManagePolicies,
    canReview,
    baseCurrency: String(context.company.currentCompany.currency || 'KES'),
    policies: mappedPolicies,
    approvers,
    queue,
  };
}
