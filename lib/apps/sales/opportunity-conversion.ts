import type { PoolClient } from 'pg';

export type RequireOpportunityUuid = (
  value: unknown,
  label: string,
) => string;

export async function markSalesOpportunityWonFromAcceptedQuote(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    opportunityId: unknown;
    quoteId: string;
    quoteNumber: string;
    orderId: string;
    orderNumber: string;
  },
  requireUuid: RequireOpportunityUuid,
): Promise<void> {
  const rawOpportunityId =
    typeof input.opportunityId === 'string'
      ? input.opportunityId.trim()
      : '';

  if (!rawOpportunityId) return;

  const opportunityId =
    requireUuid(rawOpportunityId, 'Opportunity');
  const current = await client.query(
    `SELECT
       opportunity.stage_id,
       current_stage.pipeline_id,
       current_stage.stage_type
     FROM sales_opportunities opportunity
     INNER JOIN sales_pipeline_stages current_stage
       ON current_stage.id = opportunity.stage_id
      AND current_stage.company_id = opportunity.company_id
     WHERE opportunity.id = $1
       AND opportunity.company_id = $2
       AND opportunity.deleted_at IS NULL
     FOR UPDATE OF opportunity`,
    [opportunityId, input.companyId],
  );

  // A soft-deleted CRM opportunity must not prevent a valid accepted quote
  // from becoming an order.
  if (!current.rows[0]) return;

  const currentStageType = String(current.rows[0].stage_type || 'open');
  if (currentStageType === 'won') {
    await client.query(
      `UPDATE sales_opportunities
       SET probability = 100,
           won_at = COALESCE(won_at, NOW()),
           lost_at = NULL,
           lost_reason = NULL,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [opportunityId, input.companyId, input.userId],
    );
    return;
  }

  const wonStage = await client.query(
    `SELECT id
     FROM sales_pipeline_stages
     WHERE company_id = $1
       AND pipeline_id = $2
       AND stage_type = 'won'
       AND is_active = TRUE
     ORDER BY
       CASE WHEN LOWER(BTRIM(name)) = 'won' THEN 0 ELSE 1 END,
       sequence ASC,
       id ASC
     LIMIT 1
     FOR UPDATE`,
    [input.companyId, current.rows[0].pipeline_id],
  );
  if (!wonStage.rows[0]) {
    // Keep quote-to-order available even if a custom pipeline is misconfigured.
    // The user can repair the Won stage and move the opportunity manually.
    return;
  }

  const wonStageId = String(wonStage.rows[0].id);
  const currentStageId = String(current.rows[0].stage_id);
  const reason =
    'Accepted quotation ' + input.quoteNumber +
    ' converted to sales order ' + input.orderNumber + '.';

  await client.query(
    `UPDATE sales_opportunities
     SET stage_id = $3,
         probability = 100,
         won_at = COALESCE(won_at, NOW()),
         lost_at = NULL,
         lost_reason = NULL,
         updated_by = $4,
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [opportunityId, input.companyId, wonStageId, input.userId],
  );

  await client.query(
    `INSERT INTO sales_opportunity_stage_history
       (company_id, opportunity_id, from_stage_id, to_stage_id,
        probability, reason, changed_by)
     VALUES ($1, $2, $3, $4, 100, $5, $6)`,
    [
      input.companyId,
      opportunityId,
      currentStageId,
      wonStageId,
      reason,
      input.userId,
    ],
  );

  await client.query(
    `INSERT INTO activities
       (company_id, user_id, model, record_id, type, content, metadata)
     VALUES ($1, $2, 'sales.opportunity', $3,
       'sales.opportunity.won_from_order', $4, $5::jsonb)`,
    [
      input.companyId,
      input.userId,
      opportunityId,
      reason,
      JSON.stringify({
        quoteId: input.quoteId,
        quoteNumber: input.quoteNumber,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      }),
    ],
  );
}
