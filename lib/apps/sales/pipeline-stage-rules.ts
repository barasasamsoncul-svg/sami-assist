/**
 * Terminal opportunity stages define their own probability.
 *
 * A won stage is always 100% and a lost stage is always 0%, regardless of
 * any client-supplied probability. Returning null means the caller should use
 * the normal open-stage probability validation path.
 */
export function terminalSalesOpportunityProbability(stageType: unknown): number | null {
  const type =
    typeof stageType === 'string' ? stageType.trim().toLowerCase() : '';
  if (type === 'won') return 100;
  if (type === 'lost') return 0;
  return null;
}