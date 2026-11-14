import { fieldDescriptor } from '../core/values.mjs';
import { assert, assertObject, exact } from '../core/values.mjs';
import {
  MAX_CENTS,
  ceilDiv,
  roundRatio,
  scaledDecimal,
  decimalInput,
  rationalDisplay,
  rationalStrings,
} from './arithmetic.mjs';

const SHARE_SCALE = 100000000n;
const PRICE_SCALE = 1000000n;
const COST_CENT_SCALE = (SHARE_SCALE * PRICE_SCALE) / 100n;

function purchaseCost(units, label) {
  assert(units <= MAX_CENTS * COST_CENT_SCALE, `${label} exceeds the exact supported cent range.`, {
    code: 'errors.calculators.average-cost.exceeds-the-exact-supported-cent-range',
    params: { label: label, ...fieldDescriptor(label) },
  });
  return exact(roundRatio(units, COST_CENT_SCALE));
}
function currentPosition(quantity, average) {
  assert(
    quantity <= MAX_CENTS * SHARE_SCALE,
    'Current shares exceed the exact supported share range.',
    {
      code: 'errors.calculators.average-cost.current-shares-exceed-the-exact-supported-share-range',
    },
  );
  const cost = quantity * average;
  return { quantity, cost, costCents: purchaseCost(cost, 'Current cost') };
}
function settlePurchase(current, price, added) {
  const totalShares = current.quantity + added;
  assert(
    totalShares <= MAX_CENTS * SHARE_SCALE,
    'Resulting shares exceed the exact supported share range.',
    {
      code: 'errors.calculators.average-cost.resulting-shares-exceed-the-exact-supported-share-range',
    },
  );
  const addedCost = added * price,
    totalCost = current.cost + addedCost,
    purchaseCostCents = purchaseCost(addedCost, 'Purchase cost'),
    totalCostCents = purchaseCost(totalCost, 'Total cost'),
    priceDenominator = totalShares * PRICE_SCALE,
    display = rationalDisplay(totalCost, priceDenominator, 8);
  return {
    totalShares,
    totalCost,
    fields: {
      additionalShares: scaledDecimal(added, 8),
      totalShares: scaledDecimal(totalShares, 8),
      currentCostCents: current.costCents,
      purchaseCostCents,
      totalCostCents,
      actualAveragePrice: display.decimal,
      actualAveragePriceApproximate: display.approximate,
      actualAveragePriceExact: rationalStrings(totalCost, priceDenominator),
      roundingDifferenceCents: totalCostCents - (current.costCents + purchaseCostCents),
    },
  };
}

/** Apply the exact entered purchase quantity without a share-step rounding policy. */
export function calculateAverageAfterPurchase(options) {
  assertObject(options, 'Average After Purchase inputs');
  const quantity = decimalInput(options.currentShares, 8, 'Current shares', true);
  const average = decimalInput(options.currentAveragePrice, 6, 'Current average price');
  const price = decimalInput(options.purchasePrice, 6, 'Purchase price', true);
  const added = decimalInput(options.additionalShares, 8, 'Additional shares');
  const current = currentPosition(quantity.units, average.units);
  const settlement = settlePurchase(current, price.units, added.units);
  const unchangedCost = settlement.totalShares * average.units;
  return {
    status: 'calculated',
    direction:
      settlement.totalCost > unchangedCost
        ? 'up'
        : settlement.totalCost < unchangedCost
          ? 'down'
          : 'none',
    inputs: {
      currentShares: quantity.text,
      currentAveragePrice: average.text,
      purchasePrice: price.text,
      additionalShares: added.text,
    },
    ...settlement.fields,
  };
}

/** One hypothetical fixed-price purchase; quantities and prices remain exact decimal fractions. */
export function calculateTargetAverageCost(options) {
  assertObject(options, 'Target Average Cost inputs');
  const quantity = decimalInput(options.currentShares, 8, 'Current shares', true);
  const average = decimalInput(options.currentAveragePrice, 6, 'Current average price');
  const price = decimalInput(options.purchasePrice, 6, 'Purchase price', true);
  const target = decimalInput(options.targetAveragePrice, 6, 'Target average price');
  const { shareMode } = options;
  assert(
    shareMode === 'whole' || shareMode === 'fractional',
    'Choose Whole or Fractional shares.',
    { code: 'errors.calculators.average-cost.choose-whole-or-fractional-shares' },
  );
  const increment =
    shareMode === 'whole'
      ? { units: SHARE_SCALE, text: '1' }
      : decimalInput(options.fractionalIncrement, 8, 'Fractional share increment', true);
  assert(increment.units <= SHARE_SCALE, 'Fractional share increment must not exceed one share.', {
    code: 'errors.calculators.average-cost.fractional-share-increment-must-not-exceed-one-share',
  });
  const current = currentPosition(quantity.units, average.units);
  const direction =
    average.units > target.units ? 'down' : average.units < target.units ? 'up' : 'none';
  const inputs = {
    currentShares: quantity.text,
    currentAveragePrice: average.text,
    purchasePrice: price.text,
    targetAveragePrice: target.text,
    shareMode,
    fractionalIncrement: shareMode === 'fractional' ? increment.text : null,
  };
  const result = {
    status: 'unreachable',
    direction,
    reason: null,
    reasonCode: null,
    reasonParams: {},
    inputs,
    shareIncrement: increment.text,
    currentCostCents: current.costCents,
    theoreticalAdditionalShares: null,
    additionalShares: null,
    totalShares: null,
    purchaseCostCents: null,
    totalCostCents: null,
    actualAveragePrice: null,
    actualAveragePriceApproximate: false,
    actualAveragePriceExact: null,
    exactAttainable: false,
    exactTarget: false,
    targetReached: false,
    roundingDifferenceCents: null,
  };
  if (
    direction !== 'none' &&
    (direction === 'down' ? price.units >= target.units : price.units <= target.units)
  ) {
    result.reason =
      price.units === target.units
        ? 'Buying at the target price only approaches it; no finite purchase reaches the target.'
        : `Purchase price must be ${direction === 'down' ? 'below' : 'above'} the target average.`;
    result.reasonCode =
      price.units === target.units
        ? 'calc.average.reason.asymptotic'
        : direction === 'down'
          ? 'calc.average.reason.priceBelow'
          : 'calc.average.reason.priceAbove';
    return result;
  }
  let added = 0n,
    theoreticalNumerator = 0n,
    theoreticalDenominator = 1n,
    exactAttainable = true;
  if (direction !== 'none') {
    const averageDifference =
      direction === 'down' ? average.units - target.units : target.units - average.units;
    const purchaseDifference =
      direction === 'down' ? target.units - price.units : price.units - target.units;
    const requiredUnitsNumerator = quantity.units * averageDifference;
    const stepDenominator = purchaseDifference * increment.units;
    theoreticalNumerator = requiredUnitsNumerator;
    theoreticalDenominator = SHARE_SCALE * purchaseDifference;
    added = ceilDiv(requiredUnitsNumerator, stepDenominator) * increment.units;
    exactAttainable = requiredUnitsNumerator % stepDenominator === 0n;
  }
  const settlement = settlePurchase(current, price.units, added),
    targetCost = settlement.totalShares * target.units,
    exactTarget = settlement.totalCost === targetCost;
  return {
    ...result,
    ...settlement.fields,
    status: direction === 'none' ? 'already-met' : 'calculated',
    reason: direction === 'none' ? 'The current average already equals the target.' : null,
    reasonCode: direction === 'none' ? 'calc.average.reason.alreadyMet' : null,
    theoreticalAdditionalShares: {
      ...rationalStrings(theoreticalNumerator, theoreticalDenominator),
      ...rationalDisplay(theoreticalNumerator, theoreticalDenominator, 12),
    },
    exactAttainable,
    exactTarget,
    targetReached:
      direction === 'down'
        ? settlement.totalCost <= targetCost
        : direction === 'up'
          ? settlement.totalCost >= targetCost
          : exactTarget,
  };
}
