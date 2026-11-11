import {
  assert,
  clone,
  assertId,
  assertDate,
  text,
  cents,
  exact,
  decimalCents,
  metadata,
  validateMetadata,
  dateFlags,
  uniqueIds,
  allowedKeys,
  replace,
} from '../core/values.mjs';
import { normalizeEntry } from '../core/records.mjs';
import { balanceAt, latestAccountDate } from '../core/account-ledger.mjs';
import { validateBill, redemptionInterest } from './treasury-bill.mjs';

const HOLDING_KEYS = [
  'id',
  'accountId',
  'instrument',
  'name',
  'costCents',
  'activityDate',
  'postedDate',
  'activityDateUnconfirmed',
  'postedDateUnconfirmed',
  'quantity',
  'faceValueCents',
  'termWeeks',
  'maturityDate',
  'cusip',
  'note',
  'createdAt',
  'updatedAt',
];
const DISPOSAL_KEYS = [
  'id',
  'holdingId',
  'accountId',
  'kind',
  'proceedsCents',
  'activityDate',
  'postedDate',
  'activityDateUnconfirmed',
  'postedDateUnconfirmed',
  'resultEntryId',
  'note',
  'createdAt',
  'updatedAt',
];
function investmentAccount(ledger, id) {
  const account = ledger.accounts.find((item) => item.id === id);
  assert(account?.kind === 'investment', 'Choose an existing investment account.');
  return account;
}
function resultOf(holding, activity) {
  const result =
    activity.kind === 'redemption' && holding.instrument === 'treasury_bill'
      ? redemptionInterest(holding, activity.proceedsCents)
      : exact(BigInt(activity.proceedsCents) - BigInt(holding.costCents), 'Realized result');
  return {
    resultCents: result,
    kind: result > 0 ? 'gain' : result < 0 ? 'expense' : null,
    amountCents: Math.abs(result),
  };
}
export function normalizePurchase(value, previous) {
  allowedKeys(value, HOLDING_KEYS, 'Holding');
  assert(
    ['treasury_bill', 'asset'].includes(value.instrument),
    'Choose Treasury bill or a generic holding.',
  );
  const holding = {
    ...metadata(value, previous, 'holding'),
    accountId: assertId(value.accountId, 'Investment account ID'),
    instrument: value.instrument,
    name: text(value.name, 'Holding name', { max: 100 }),
    costCents: cents(value.costCents, 'Purchase cost', { positive: true }),
    activityDate: assertDate(value.activityDate, 'Purchase activity date'),
    postedDate: assertDate(value.postedDate, 'Purchase posting date'),
    ...dateFlags(value, ['activityDateUnconfirmed', 'postedDateUnconfirmed']),
    note: text(value.note, 'Holding note', { optional: true }),
  };
  if (value.quantity !== undefined) {
    assert(
      typeof value.quantity === 'number' && Number.isFinite(value.quantity) && value.quantity > 0,
      'Quantity must be a positive number.',
    );
    holding.quantity = value.quantity;
  }
  if (value.faceValueCents !== undefined)
    holding.faceValueCents = cents(value.faceValueCents, 'Face value', { positive: true });
  if (value.termWeeks !== undefined) holding.termWeeks = value.termWeeks;
  if (value.maturityDate !== undefined)
    holding.maturityDate = assertDate(value.maturityDate, 'Contract maturity');
  if (value.cusip !== undefined) holding.cusip = text(value.cusip, 'CUSIP').toUpperCase();
  if (holding.instrument === 'treasury_bill') validateBill(holding);
  else
    assert(
      !['faceValueCents', 'termWeeks', 'maturityDate', 'cusip'].some((key) =>
        Object.hasOwn(holding, key),
      ),
      'Treasury bill details belong on a Treasury bill holding.',
    );
  return holding;
}
export function normalizeDisposal(value, previous) {
  allowedKeys(value, DISPOSAL_KEYS, 'Investment activity');
  assert(['sale', 'redemption'].includes(value.kind), 'Choose Sale or Redemption.');
  const proceedsCents = cents(value.proceedsCents, 'Actual proceeds');
  assert(proceedsCents >= 0, 'Actual proceeds cannot be negative.');
  const activity = {
    ...metadata(value, previous, 'disposal'),
    holdingId: assertId(value.holdingId, 'Holding ID'),
    accountId: assertId(value.accountId, 'Investment account ID'),
    kind: value.kind,
    proceedsCents,
    activityDate: assertDate(value.activityDate, 'Investment activity date'),
    postedDate: assertDate(value.postedDate, 'Investment posting date'),
    ...dateFlags(value, ['activityDateUnconfirmed', 'postedDateUnconfirmed']),
    note: text(value.note, 'Investment activity note', { optional: true }),
  };
  if (value.resultEntryId !== undefined)
    activity.resultEntryId = assertId(value.resultEntryId, 'Realized result entry ID');
  return activity;
}
export function validateInvestments(ledger) {
  uniqueIds(ledger.holdings, 'Holdings');
  uniqueIds(ledger.investmentActivities, 'Investment activities');
  const holdings = new Map();
  const disposed = new Set();
  const linkedEntries = new Set();
  for (const holding of ledger.holdings) {
    validateMetadata(holding);
    normalizePurchase(holding, holding);
    const account = investmentAccount(ledger, holding.accountId);
    assert(
      holding.postedDate >= account.openedDate,
      'Purchase posting date cannot precede the investment account opening.',
    );
    holdings.set(holding.id, holding);
  }
  for (const activity of ledger.investmentActivities) {
    validateMetadata(activity);
    normalizeDisposal(activity, activity);
    const holding = holdings.get(activity.holdingId);
    assert(holding, 'An investment activity references a missing holding.');
    investmentAccount(ledger, activity.accountId);
    assert(
      activity.accountId === holding.accountId,
      'An investment activity must use the same account as its holding.',
    );
    assert(
      activity.postedDate >= holding.postedDate,
      'Sale/redemption posting date cannot precede its purchase posting date.',
    );
    assert(
      activity.kind !== 'redemption' || holding.instrument === 'treasury_bill',
      'Redemption is available for Treasury bills; use Sale for a generic holding.',
    );
    assert(!disposed.has(holding.id), 'A full holding can be sold or redeemed only once.');
    disposed.add(holding.id);
    const expected = resultOf(holding, activity);
    if (expected.kind === null) {
      assert(!activity.resultEntryId, 'A zero realized result must not link a Gain or Expense.');
      continue;
    }
    const entry = ledger.entries.find((item) => item.id === activity.resultEntryId);
    assert(entry, 'The investment result needs an existing linked Gain/Expense entry.');
    assert(
      entry.accountId === activity.accountId,
      'The linked investment result must use the same investment account.',
    );
    assert(
      entry.kind === expected.kind && entry.amountCents === expected.amountCents,
      `Investment result requires a ${expected.kind === 'gain' ? 'Gain' : 'Expense'} of ${decimalCents(expected.amountCents)}; the linked entry must match exactly.`,
    );
    assert(!linkedEntries.has(entry.id), 'A Gain/Expense can explain only one investment result.');
    linkedEntries.add(entry.id);
  }
  for (const account of ledger.accounts.filter((item) => item.kind === 'investment')) {
    const events = new Map();
    const add = (date, book = 0n, cost = 0n) => {
      const e = events.get(date) ?? { book: 0n, cost: 0n };
      e.book += book;
      e.cost += cost;
      events.set(date, e);
    };
    for (const entry of ledger.entries)
      if (entry.accountId === account.id)
        add(entry.postedDate, (entry.kind === 'gain' ? 1n : -1n) * BigInt(entry.amountCents));
    for (const transfer of ledger.transfers) {
      if (transfer.sourceAccountId === account.id)
        add(transfer.sourcePostedDate, -BigInt(transfer.amountCents));
      if (transfer.targetAccountId === account.id)
        add(transfer.targetPostedDate, BigInt(transfer.amountCents));
    }
    for (const holding of ledger.holdings)
      if (holding.accountId === account.id) add(holding.postedDate, 0n, BigInt(holding.costCents));
    for (const activity of ledger.investmentActivities)
      if (activity.accountId === account.id)
        add(activity.postedDate, 0n, -BigInt(holdings.get(activity.holdingId).costCents));
    let book = 0n;
    let cost = 0n;
    for (const date of [...events.keys()].sort()) {
      const event = events.get(date);
      book += event.book;
      cost += event.cost;
      exact(cost, 'Active holdings cost');
      exact(book - cost, 'Investment cash');
    }
  }
  return ledger;
}
export function savePurchase(ledger, value) {
  const next = clone(ledger);
  const previous = next.holdings.find((item) => item.id === value.id);
  next.holdings = replace(next.holdings, normalizePurchase(value, previous));
  validateInvestments(next);
  return next;
}
export function deletePurchase(ledger, id) {
  assert(
    ledger.holdings.some((item) => item.id === id),
    'Choose an existing holding.',
  );
  const next = clone(ledger);
  next.holdings = next.holdings.filter((item) => item.id !== id);
  validateInvestments(next);
  return next;
}
export function saveDisposal(ledger, value) {
  allowedKeys(value, [...DISPOSAL_KEYS, 'resultMode', 'resultEntry'], 'Investment activity form');
  const next = clone(ledger);
  const previous = next.investmentActivities.find((item) => item.id === value.id);
  const holding = next.holdings.find((item) => item.id === value.holdingId);
  assert(holding, 'Choose an existing holding.');
  const persisted = Object.fromEntries(
    Object.entries(value).filter(([key]) => !['resultMode', 'resultEntry'].includes(key)),
  );
  if (persisted.resultEntryId === '') delete persisted.resultEntryId;
  persisted.accountId ??= holding.accountId;
  let activity = normalizeDisposal(persisted, previous);
  const expected = resultOf(holding, activity);
  if (expected.kind === null) {
    assert(
      !previous?.resultEntryId,
      'Changing this linked result to zero needs an explicit reviewed unlink correction; the entry will not be removed automatically.',
    );
    assert(!activity.resultEntryId, 'A zero result must not select a Gain/Expense.');
    assert(
      !value.resultMode || value.resultMode === 'none',
      'A zero result needs no Gain/Expense entry.',
    );
  } else {
    const mode =
      value.resultMode ??
      (previous?.resultEntryId ? 'existing' : activity.resultEntryId ? 'existing' : 'new');
    assert(['new', 'existing'].includes(mode), 'Create or select the realized Gain/Expense.');
    if (previous?.resultEntryId) {
      assert(
        !activity.resultEntryId || activity.resultEntryId === previous.resultEntryId,
        'Replacing a linked result requires an explicit reviewed unlink correction.',
      );
      activity.resultEntryId = previous.resultEntryId;
    }
    if (mode === 'existing') {
      activity.resultEntryId ??= previous?.resultEntryId;
      assert(activity.resultEntryId, 'Select the existing realized Gain/Expense.');
    } else {
      const currentEntry = previous?.resultEntryId
        ? next.entries.find((item) => item.id === previous.resultEntryId)
        : undefined;
      const draft = value.resultEntry;
      assert(draft && typeof draft === 'object', 'Complete the Gain/Expense fields in this form.');
      if (currentEntry)
        assert(
          !draft.id || draft.id === currentEntry.id,
          'Keep the stable ID of the existing realized-result entry.',
        );
      assert(
        draft.kind === undefined || draft.kind === expected.kind,
        'The result entry type must match the investment result.',
      );
      assert(
        draft.accountId === undefined || draft.accountId === activity.accountId,
        'The result entry must use the investment account.',
      );
      assert(
        draft.amountCents === undefined || draft.amountCents === expected.amountCents,
        'The result entry amount must match the investment result.',
      );
      const entry = normalizeEntry(
        {
          ...draft,
          ...(currentEntry ? { id: currentEntry.id, createdAt: currentEntry.createdAt } : {}),
          kind: expected.kind,
          accountId: activity.accountId,
          amountCents: expected.amountCents,
        },
        currentEntry,
      );
      next.entries = replace(next.entries, entry);
      if (!currentEntry) next.entryOrder.unshift(entry.id);
      activity.resultEntryId = entry.id;
    }
  }
  next.investmentActivities = replace(next.investmentActivities, activity);
  validateInvestments(next);
  return next;
}
export function deleteDisposal(ledger, id) {
  const activity = ledger.investmentActivities.find((item) => item.id === id);
  assert(activity, 'Choose an existing investment activity.');
  assert(
    !activity.resultEntryId,
    'This activity has a linked result. Its removal needs an explicit reviewed correction; no Gain/Expense will be deleted automatically.',
  );
  const next = clone(ledger);
  next.investmentActivities = next.investmentActivities.filter((item) => item.id !== id);
  validateInvestments(next);
  return next;
}
export function investmentSummary(ledger, accountId, { through = '' } = {}) {
  investmentAccount(ledger, accountId);
  const cutoff = through || latestAccountDate(ledger, accountId);
  assertDate(cutoff, 'Investment cutoff');
  const disposals = new Map(
    ledger.investmentActivities
      .filter((item) => item.accountId === accountId)
      .map((item) => [item.holdingId, item]),
  );
  let activeCost = 0n;
  const holdings = ledger.holdings
    .filter((item) => item.accountId === accountId)
    .map((item) => {
      const disposal = disposals.get(item.id);
      const status =
        item.postedDate > cutoff
          ? 'future'
          : disposal && disposal.postedDate <= cutoff
            ? 'disposed'
            : 'active';
      const remainingCostCents = status === 'active' ? item.costCents : 0;
      activeCost += BigInt(remainingCostCents);
      return {
        ...clone(item),
        status,
        remainingCostCents,
        activeCostCents: remainingCostCents,
        ...(disposal ? { disposal: clone(disposal) } : {}),
      };
    });
  const bookBalanceCents = balanceAt(ledger, accountId, cutoff);
  const activities = [];
  for (const holding of holdings)
    activities.push({
      ...clone(holding),
      kind: 'purchase',
      holdingId: holding.id,
      amountCents: holding.costCents,
      cashChangeCents: -holding.costCents,
      resultCents: 0,
    });
  for (const activity of ledger.investmentActivities.filter(
    (item) => item.accountId === accountId,
  )) {
    const holding = ledger.holdings.find((item) => item.id === activity.holdingId);
    const result = resultOf(holding, activity);
    activities.push({
      ...clone(activity),
      name: holding.name,
      amountCents: activity.proceedsCents,
      cashChangeCents: activity.proceedsCents,
      resultCents: result.resultCents,
      resultKind: result.kind,
    });
  }
  activities.sort((a, b) => b.postedDate.localeCompare(a.postedDate) || b.id.localeCompare(a.id));
  return {
    accountId,
    through: cutoff,
    endDate: cutoff,
    bookBalanceCents,
    holdingsCostCents: exact(activeCost, 'Holdings cost'),
    cashBalanceCents: exact(BigInt(bookBalanceCents) - activeCost, 'Investment cash'),
    holdings,
    positions: holdings,
    activities,
  };
}
