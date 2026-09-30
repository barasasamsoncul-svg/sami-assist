/** Every join repeats company scope; reports use posted ledger entries only. */
export const ACCOUNT_BALANCES_SQL = `
  SELECT a.id, a.code, a.name, a.account_type, a.is_active,
    COALESCE(SUM(l.debit - l.credit) FILTER (WHERE j.journal_date < $2::date),0)::text AS opening,
    COALESCE(SUM(l.debit) FILTER (WHERE j.journal_date BETWEEN $2::date AND $3::date),0)::text AS debit,
    COALESCE(SUM(l.credit) FILTER (WHERE j.journal_date BETWEEN $2::date AND $3::date),0)::text AS credit,
    COALESCE(SUM(l.debit - l.credit),0)::text AS balance
  FROM accounts a
  LEFT JOIN (journal_lines l INNER JOIN journals j
    ON j.id = l.journal_id AND j.company_id = l.company_id
    AND j.status = 'posted' AND j.deleted_at IS NULL AND j.journal_date <= $3::date)
    ON l.account_id = a.id AND l.company_id = a.company_id AND l.deleted_at IS NULL
  WHERE a.company_id = $1 AND a.deleted_at IS NULL
  GROUP BY a.id, a.code, a.name, a.account_type, a.is_active ORDER BY a.code, a.id`;
export const LEDGER_SQL = `
  SELECT l.id, j.id AS journal_id, j.journal_number, j.journal_date::text AS journal_date,
    j.reference, COALESCE(NULLIF(l.description,''), j.description) AS description,
    a.code, a.name, l.debit::text AS debit, l.credit::text AS credit,
    ($6::numeric + SUM(l.debit-l.credit) OVER (ORDER BY j.journal_date,j.created_at,j.id,l.created_at,l.id))::text AS running_balance,
    COUNT(*) OVER()::int AS total_count
  FROM journal_lines l JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id
  JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id
  WHERE l.company_id=$1 AND l.deleted_at IS NULL AND j.deleted_at IS NULL AND a.deleted_at IS NULL
    AND j.status='posted' AND j.journal_date BETWEEN $2::date AND $3::date
    AND l.account_id=$4::uuid
  ORDER BY j.journal_date,j.created_at,j.id,l.created_at,l.id LIMIT 50 OFFSET $5`;
