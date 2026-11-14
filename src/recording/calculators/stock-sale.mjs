import { fieldDescriptor } from '../core/values.mjs';
import { assert, assertObject, cents, exact } from '../core/values.mjs';
import {
  MAX_CENTS,
  decimalInput,
  scaledDecimal,
  roundSignedRatio,
  rationalDisplay,
  rationalStrings,
} from './arithmetic.mjs';

export const MAX_SALE_LOTS = 100;
const SHARE_SCALE = 100000000n;
const PRICE_SCALE = 1000000n;
const CENT_SCALE = (SHARE_SCALE * PRICE_SCALE) / 100n;
const AMOUNTS = [
  ['currentBasis', 'Current cost basis'],
  ['soldBasis', 'Sold cost basis'],
  ['remainingBasis', 'Remaining cost basis'],
  ['grossProceeds', 'Gross proceeds'],
  ['gainBeforeFees', 'Gain/loss before fees'],
];
const abs = (value) => (value < 0n ? -value : value);

function checkedShares(units, label) {
  assert(units <= MAX_CENTS * SHARE_SCALE, `${label} exceeds the exact supported share range.`, {
    code: 'errors.calculators.stock-sale.exceeds-the-exact-supported-share-range',
    params: { label: label, ...fieldDescriptor(label) },
  });
  return scaledDecimal(units, 8);
}
function checkedAmount(units, label) {
  assert(abs(units) <= MAX_CENTS * CENT_SCALE, `${label} exceeds the exact supported cent range.`, {
    code: 'errors.calculators.stock-sale.exceeds-the-exact-supported-cent-range',
    params: { label: label, ...fieldDescriptor(label) },
  });
  return exact(roundSignedRatio(units, CENT_SCALE));
}
function amountFields(raw, prefix = '') {
  return Object.fromEntries(
    AMOUNTS.map(([key, label]) => [`${key}Cents`, checkedAmount(raw[key], `${prefix}${label}`)]),
  );
}
function difference(total, ...components) {
  return exact(BigInt(total) - components.reduce((sum, value) => sum + BigInt(value), 0n));
}
function componentDifferences(fields) {
  return {
    basisCents: difference(
      fields.currentBasisCents,
      fields.soldBasisCents,
      fields.remainingBasisCents,
    ),
    gainBeforeFeesCents: difference(
      fields.gainBeforeFeesCents,
      fields.grossProceedsCents,
      -BigInt(fields.soldBasisCents),
    ),
  };
}
function percentReturn(netGain, soldBasis) {
  if (soldBasis === 0n) return null;
  const numerator = abs(netGain) * 100n;
  const display = rationalDisplay(numerator, soldBasis, 6);
  const ratio = rationalStrings(numerator, soldBasis);
  return {
    decimal:
      netGain < 0n && display.decimal !== '0.000000' ? `-${display.decimal}` : display.decimal,
    approximate: display.approximate,
    numerator: netGain < 0n ? `-${ratio.numerator}` : ratio.numerator,
    denominator: ratio.denominator,
  };
}

/** Manual, pre-tax sale scenario; each lot's basis is its entered shares times unit cost. */
export function calculateStockSale(options) {
  assertObject(options, 'Stock sale inputs');
  const salePrice = decimalInput(options.salePrice, 6, 'Sale price');
  const sellingFeesCents = cents(
    options.sellingFeesCents === undefined ? 0 : options.sellingFeesCents,
    'Selling fees',
  );
  assert(sellingFeesCents >= 0, 'Selling fees must not be negative.', {
    code: 'errors.calculators.stock-sale.selling-fees-must-not-be-negative',
  });
  assert(
    Array.isArray(options.lots) && options.lots.length > 0 && options.lots.length <= MAX_SALE_LOTS,
    `Enter between 1 and ${MAX_SALE_LOTS} stock lots.`,
    {
      code: 'errors.calculators.stock-sale.enter-between-1-and-stock-lots',
      params: { MAX_SALE_LOTS: MAX_SALE_LOTS },
    },
  );
  const ids = new Set();
  const rawLots = Array.from(options.lots, (lot, index) => {
    const name = `Lot ${index + 1}`;
    assertObject(lot, name);
    assert(typeof lot.id === 'string' && lot.id.trim().length > 0, `${name} needs a nonblank ID.`, {
      code: 'errors.calculators.stock-sale.needs-a-nonblank-id',
      params: { name: name, index: index + 1 },
    });
    assert(!ids.has(lot.id), 'Stock lot IDs must be unique.', {
      code: 'errors.calculators.stock-sale.stock-lot-ids-must-be-unique',
    });
    ids.add(lot.id);
    const label = lot.label === undefined ? '' : lot.label;
    assert(
      typeof label === 'string' && label.length <= 100,
      `${name} label must be at most 100 characters.`,
      {
        code: 'errors.calculators.stock-sale.label-must-be-at-most-100-characters',
        params: { name: name, index: index + 1 },
      },
    );
    const held = decimalInput(lot.sharesHeld, 8, `${name} shares held`, true);
    const basis = decimalInput(lot.costBasisPerShare, 6, `${name} cost basis per share`);
    const sold = decimalInput(lot.sharesToSell, 8, `${name} shares to sell`);
    assert(sold.units <= held.units, `${name} shares to sell must not exceed shares held.`, {
      code: 'errors.calculators.stock-sale.shares-to-sell-must-not-exceed-shares-held',
      params: { name: name, index: index + 1 },
    });
    const remaining = held.units - sold.units;
    const raw = {
      held: held.units,
      sold: sold.units,
      remaining,
      currentBasis: held.units * basis.units,
      soldBasis: sold.units * basis.units,
      remainingBasis: remaining * basis.units,
      grossProceeds: sold.units * salePrice.units,
    };
    raw.gainBeforeFees = raw.grossProceeds - raw.soldBasis;
    return {
      input: {
        id: lot.id,
        label,
        sharesHeld: held.text,
        costBasisPerShare: basis.text,
        sharesToSell: sold.text,
      },
      raw,
    };
  });
  assert(
    rawLots.some(({ raw }) => raw.sold > 0n),
    'Sell a positive quantity from at least one lot.',
    { code: 'errors.calculators.stock-sale.sell-a-positive-quantity-from-at-least-one-lot' },
  );
  const sum = (key) => rawLots.reduce((total, { raw }) => total + raw[key], 0n);
  const sharesHeld = checkedShares(sum('held'), 'Total shares held');
  const sharesToSell = checkedShares(sum('sold'), 'Total shares to sell');
  const sharesRemaining = checkedShares(sum('remaining'), 'Total remaining shares');
  const rawTotals = Object.fromEntries(AMOUNTS.map(([key]) => [key, sum(key)]));
  const totals = amountFields(rawTotals);
  const fees = BigInt(sellingFeesCents) * CENT_SCALE;
  const netProceeds = rawTotals.grossProceeds - fees;
  const netGain = rawTotals.gainBeforeFees - fees;
  const netProceedsCents = checkedAmount(netProceeds, 'Net proceeds');
  const netGainLossCents = checkedAmount(netGain, 'Net gain/loss');
  const lots = rawLots.map(({ input, raw }, index) => {
    const fields = amountFields(raw, `Lot ${index + 1} `);
    return {
      ...input,
      sharesRemaining: scaledDecimal(raw.remaining, 8),
      ...fields,
      roundingDifferences: componentDifferences(fields),
    };
  });
  const rowDifferences = Object.fromEntries(
    AMOUNTS.map(([key]) => {
      const field = `${key}Cents`;
      return [field, difference(totals[field], ...lots.map((lot) => lot[field]))];
    }),
  );
  return {
    status: 'calculated',
    inputs: {
      salePrice: salePrice.text,
      sellingFeesCents,
      lots: rawLots.map(({ input }) => ({ ...input })),
    },
    lotCount: lots.length,
    soldLotCount: rawLots.filter(({ raw }) => raw.sold > 0n).length,
    sharesHeld,
    sharesToSell,
    sharesRemaining,
    ...totals,
    netProceedsCents,
    sellingFeesCents,
    netGainLossCents,
    returnPercent: percentReturn(netGain, rawTotals.soldBasis),
    lots,
    roundingDifferences: {
      rows: rowDifferences,
      ...componentDifferences(totals),
      netProceedsCents: difference(
        netProceedsCents,
        totals.grossProceedsCents,
        -BigInt(sellingFeesCents),
      ),
      netGainLossCents: difference(
        netGainLossCents,
        totals.gainBeforeFeesCents,
        -BigInt(sellingFeesCents),
      ),
      netGainFromProceedsCents: difference(
        netGainLossCents,
        netProceedsCents,
        -BigInt(totals.soldBasisCents),
      ),
    },
  };
}
