/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type SalesLeadAssignmentCandidate = {
  userId: string;
  name: string;
  activeLeadCount: number;
  lastAssignedAt: Date | string | null;
};

export type SalesLeadAssignmentRuleCandidate = {
  id: string;
  salesTeamId: string;
  sourceMatch: string | null;
  priority: number;
  createdAt: Date | string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function timestampOr(value: Date | string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* -------------------------------------------------------------------------- */
/*  Assignee selection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Chooses the least-loaded active team member.
 * Tie-breaks:
 *   1. Fewer active leads
 *   2. Oldest most-recent assignment (never-assigned first)
 *   3. Name (locale-insensitive compare)
 *   4. User ID (for deterministic output across DB orderings)
 */
export function chooseBalancedSalesLeadAssignee(
  candidates: SalesLeadAssignmentCandidate[],
): SalesLeadAssignmentCandidate | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort(
    (a, b) =>
      a.activeLeadCount - b.activeLeadCount ||
      timestampOr(a.lastAssignedAt, Number.NEGATIVE_INFINITY) -
        timestampOr(b.lastAssignedAt, Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name) ||
      a.userId.localeCompare(b.userId),
  )[0];
}

/* -------------------------------------------------------------------------- */
/*  Rule selection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Picks the highest-priority rule that matches `source`.
 * A rule with an empty `sourceMatch` matches any source.
 * Tie-breaks:
 *   1. Lower numeric priority
 *   2. Longer `sourceMatch` (more specific)
 *   3. Older `createdAt`
 *   4. Rule ID (deterministic)
 */
export function selectSalesLeadAssignmentRule(
  rules: SalesLeadAssignmentRuleCandidate[],
  source: unknown,
): SalesLeadAssignmentRuleCandidate | null {
  if (rules.length === 0) return null;

  const normalizedSource =
    typeof source === 'string' ? source.trim().toLowerCase() : '';

  const matches = rules.filter((rule) => {
    const match = String(rule.sourceMatch || '').trim().toLowerCase();
    if (!match) return true;
    return normalizedSource.length > 0 && normalizedSource.includes(match);
  });

  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      a.priority - b.priority ||
      String(b.sourceMatch || '').trim().length -
        String(a.sourceMatch || '').trim().length ||
      timestampOr(a.createdAt, Number.POSITIVE_INFINITY) -
        timestampOr(b.createdAt, Number.POSITIVE_INFINITY) ||
      a.id.localeCompare(b.id),
  );

  return matches[0] || null;
}