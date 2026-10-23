import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDemandPlan } from '../lib/apps/demand_planning/forecast-math';

test('moving average extends historical daily demand and safety-stock coverage', () => {
  const plan = calculateDemandPlan({
    historicalQuantity: 90, historyDays: 90, horizonDays: 30,
    availableQuantity: 10, reorderLevel: 5, safetyStockDays: 14, demandDays: 9,
  });
  assert.equal(plan.dailyAverage, 1);
  assert.equal(plan.forecastQuantity, 30);
  assert.equal(plan.safetyStockQuantity, 14);
  assert.equal(plan.recommendedQuantity, 34);
  assert.equal(plan.signalStrength, 65);
});

test('recommendations respect reorder levels and never go below zero', () => {
  const shortage = calculateDemandPlan({
    historicalQuantity: 0, historyDays: 90, horizonDays: 30,
    availableQuantity: 4, reorderLevel: 12, safetyStockDays: 14, demandDays: 0,
  });
  assert.equal(shortage.recommendedQuantity, 8);
  const sufficient = calculateDemandPlan({
    historicalQuantity: 3, historyDays: 90, horizonDays: 7,
    availableQuantity: 100, reorderLevel: 0, safetyStockDays: 0, demandDays: 1,
  });
  assert.equal(sufficient.recommendedQuantity, 0);
  assert.equal(sufficient.signalStrength, 25);
});

test('negative or invalid quantities are normalized to zero', () => {
  const plan = calculateDemandPlan({
    historicalQuantity: -9, historyDays: 90, horizonDays: 30,
    availableQuantity: -5, reorderLevel: -1, safetyStockDays: 14, demandDays: -2,
  });
  assert.equal(plan.dailyAverage, 0);
  assert.equal(plan.forecastQuantity, 0);
  assert.equal(plan.recommendedQuantity, 0);
  assert.equal(plan.signalStrength, 20);
});
