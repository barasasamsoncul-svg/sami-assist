    const where = `
      a.company_id = $1 AND a.deleted_at IS NULL
      AND ($2::text = '%%' OR a.account_name ILIKE $2 OR COALESCE(a.email, '') ILIKE $2 OR COALESCE(a.phone, '') ILIKE $2)
      AND ($3::text = '' OR a.lifecycle_stage = $3)
      AND ($4::text = '' OR a.account_type = $4)
      AND ($5::text = '' OR COALESCE(a.industry, '') = $5)
      AND ($6::text = '' OR COALESCE(a.source, '') = $6)
      AND ($7::text = '' OR ($7::text = 'unassigned' AND a.owner_user_id IS NULL) OR a.owner_user_id::text = $7)
      AND ($8::text = 'all'
        OR ($8::text = 'engaged' AND EXISTS (SELECT 1 FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL AND COALESCE(i.occurred_at, i.completed_at, i.created_at) >= NOW() - INTERVAL '90 days'))
        OR ($8::text = 'not_engaged' AND NOT EXISTS (SELECT 1 FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL AND COALESCE(i.occurred_at, i.completed_at, i.created_at) >= NOW() - INTERVAL '90 days')))
    `;

    const params = [context.companyId, searchPattern, lifecycleStage, accountType, industry, source, ownerUserId, engagement];
    const [countsResult, rowsResult, industriesResult, sourcesResult, ownersResult] = await Promise.all([
      context.pool.query(
        'SELECT COUNT(*)::int AS total, ' +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'lead')::int AS leads, " +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'qualified')::int AS qualified, " +
        "COUNT(*) FILTER (WHERE a.lifecycle_stage = 'customer')::int AS customers, " +
        "COUNT(*) FILTER (WHERE a.account_type = 'partner')::int AS partners " +
        'FROM public.crm_accounts a WHERE ' + where,
        params,
      ),
      context.pool.query(
        'SELECT a.id, a.account_name, a.account_type, a.lifecycle_stage, a.industry, a.source, ' +
        'a.email, a.phone, a.owner_user_id, a.created_at, a.updated_at, ' +
        "(SELECT COUNT(*)::int FROM public.crm_contacts c WHERE c.company_id = a.company_id AND c.account_id = a.id AND c.deleted_at IS NULL) AS contact_count, " +
        "(SELECT MAX(COALESCE(i.occurred_at, i.completed_at, i.created_at)) FROM public.crm_interactions i WHERE i.company_id = a.company_id AND i.account_id = a.id AND i.deleted_at IS NULL) AS last_interaction_at " +
        'FROM public.crm_accounts a WHERE ' + where +
        ' ORDER BY LOWER(a.account_name), a.id LIMIT $9 OFFSET $10',
        [...params, PAGE_SIZE, offset],
      ),
      context.pool.query(
        "SELECT DISTINCT industry FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND NULLIF(BTRIM(industry), '') IS NOT NULL ORDER BY industry LIMIT 100",
        [context.companyId],
      ),
      context.pool.query(
        "SELECT DISTINCT source FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND NULLIF(BTRIM(source), '') IS NOT NULL ORDER BY source LIMIT 100",
        [context.companyId],
      ),
      context.pool.query(
        "SELECT DISTINCT owner_user_id::text AS id FROM public.crm_accounts WHERE company_id = $1 AND deleted_at IS NULL AND owner_user_id IS NOT NULL ORDER BY id LIMIT 100",
        [context.companyId],
      ),
    ]);

    const summary = countsResult.rows[0] || { total: 0, leads: 0, qualified: 0, customers: 0, partners: 0 };
    const total = Number(summary.total || 0);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return json({
      success: true,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      total,
      pages,
      summary,
      options: {
        industries: industriesResult.rows.map((row: { industry: string }) => row.industry),
        sources: sourcesResult.rows.map((row: { source: string }) => row.source),
        owners: ownersResult.rows.map((row: { id: string }) => row.id),
      },
      accounts: rowsResult.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
