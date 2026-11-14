import { assert, assertDate, cents, text, exact } from '../core/values.mjs';
export function validateBill(holding) {
  assert(holding.instrument === 'treasury_bill', 'Choose a Treasury bill holding.', {
    code: 'errors.behaviors.treasury-bill.choose-a-treasury-bill-holding',
  });
  if (holding.faceValueCents !== undefined)
    cents(holding.faceValueCents, 'Face value', { positive: true });
  if (holding.termWeeks !== undefined)
    assert(
      Number.isInteger(holding.termWeeks) && holding.termWeeks >= 1 && holding.termWeeks <= 52,
      'Treasury bill term must be 1–52 whole weeks.',
      { code: 'errors.behaviors.treasury-bill.treasury-bill-term-must-be-1-52-whole-weeks' },
    );
  if (holding.maturityDate !== undefined) {
    assertDate(holding.maturityDate, 'Contract maturity');
    assert(
      holding.maturityDate >= holding.postedDate,
      'Contract maturity cannot precede the purchase posting date.',
      {
        code: 'errors.behaviors.treasury-bill.contract-maturity-cannot-precede-the-purchase-posting-date',
      },
    );
  }
  if (holding.cusip !== undefined)
    assert(
      /^[A-Z0-9]{9}$/.test(text(holding.cusip, 'CUSIP')),
      'CUSIP must contain nine uppercase letters or numbers.',
      {
        code: 'errors.behaviors.treasury-bill.cusip-must-contain-nine-uppercase-letters-or-numbers',
      },
    );
  return holding;
}
export function redemptionInterest(holding, proceedsCents) {
  validateBill(holding);
  cents(proceedsCents, 'Redemption proceeds', { positive: true });
  return exact(BigInt(proceedsCents) - BigInt(holding.costCents), 'Realized interest');
}
