export type SalesLeadAssignmentCandidate = {
  userId: string;
  name: string;
  activeLeadCount: number;
  lastAssignedAt: Date | string | null;
};

/**
 * Chooses the least-loaded active team member. Ties go to the person whose
 * most recent lead assignment is oldest, then name and user ID for stability.
 */
export function chooseBalancedSalesLeadAssignee(
  candidates: SalesLeadAssignmentCandidate[],
): SalesLeadAssignmentCandidate | null {
  if (candidates.length === 0) return null;

  const timestamp = (value: Date | string | null) => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };

  return [...candidates].sort((a, b) =>
    a.activeLeadCount - b.activeLeadCount ||
    timestamp(a.lastAssignedAt) - timestamp(b.lastAssignedAt) ||
    a.name.localeCompare(b.name) ||
    a.userId.localeCompare(b.userId)
  )[0];
}
