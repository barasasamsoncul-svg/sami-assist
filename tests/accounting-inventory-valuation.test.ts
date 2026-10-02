import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyInventoryEvent,
  inventoryMoneyCents,
  inventoryQuantityUnits,
  moneyDecimal,
  quantityDecimal,
  standardCostValue,
} from '../lib/apps/accounting/inventory-valuation-rules';

test('inventory valuation decimal helpers preserve accounting precision', () => {
  assert.equal(inventoryQuantityUnits('12.3456'), BigInt(123456));
  assert.equal(inventoryQuantityUnits('-0.0001'), BigInt(-1));
  assert.equal(inventoryMoneyCents('19.99'), BigInt(1999));
  assert.equal(inventoryMoneyCents('-0.01'), BigInt(-1));
  assert.equal(quantityDecimal(BigInt(-12345)), '-1.2345');
  assert.equal(moneyDecimal(BigInt(-12345)), '-123.45');

  assert.throws(
    () => inventoryQuantityUnits('1.23456'),
    /Inventory quantity is invalid/,
  );
  assert.throws(
    () => inventoryMoneyCents('1.001'),
    /Inventory amount is invalid/,
  );
});

test('standard-cost valuation rounds to ledger cents and ignores quantity sign', () => {
  assert.equal(standardCostValue('2.5000', '4.0000'), '10.00');
  assert.equal(standardCostValue('-2.5000', '4.0000'), '10.00');
  assert.equal(standardCostValue('2.0000', '4.1250'), '8.25');
  assert.equal(standardCostValue('3.0000', '0.3333'), '1.00');
});

test('inventory event classification maps authoritative movement direction to accounting treatment', () => {
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_delivery',
      quantityEffect: '-2.0000',
    }),
    'cogs_issue',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_return',
      quantityEffect: '2.0000',
    }),
    'cogs_return',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'inventory_adjustment_gain',
      quantityEffect: '1.0000',
    }),
    'adjustment_gain',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'inventory_adjustment_loss',
      quantityEffect: '-1.0000',
    }),
    'adjustment_loss',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_delivery',
      quantityEffect: '2.0000',
    }),
    'review',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'manual_transfer',
      quantityEffect: '-1.0000',
    }),
    'review',
  );
});
