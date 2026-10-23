export type DemandPlanMath = {
  dailyAverage: number; forecastQuantity: number; safetyStockQuantity: number;
  recommendedQuantity: number; signalStrength: number; rationale: string;
};
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10000) / 10000 : 0;
}
/** A transparent moving-average baseline; signal strength is a heuristic, not a statistical confidence interval. */
export function calculateDemandPlan(input: {
  historicalQuantity: number; historyDays: number; horizonDays: number;
  availableQuantity: number; reorderLevel: number; safetyStockDays: number; demandDays: number;
}): DemandPlanMath {
  const average = nonNegative(input.historicalQuantity) / Math.max(1, Math.trunc(input.historyDays));
  const dailyAverage = nonNegative(average);
  const forecastQuantity = nonNegative(dailyAverage * Math.max(1, Math.trunc(input.horizonDays)));
  const safetyStockQuantity = nonNegative(dailyAverage * Math.max(0, Math.trunc(input.safetyStockDays)));
  const available = nonNegative(input.availableQuantity);
  const reorder = nonNegative(input.reorderLevel);
  const recommendedQuantity = nonNegative(Math.max(0, forecastQuantity + safetyStockQuantity - available, reorder - available));
  const signalStrength = Math.min(95, 20 + Math.min(75, Math.max(0, Math.trunc(input.demandDays)) * 5));
  return {
    dailyAverage, forecastQuantity, safetyStockQuantity, recommendedQuantity, signalStrength,
    rationale: recommendedQuantity > 0
      ? 'Forecast demand plus safety stock exceeds available stock or the configured reorder level.'
      : 'Available stock covers the forecast horizon, safety stock and configured reorder level.',
  };
}
