import {
  assert,
  assertArray,
  assertDate,
  assertId,
  assertObject,
  cents,
  exact,
} from '../core/values.mjs';
import { orderedEntries } from '../core/records.mjs';

export const MAX_ANALYSIS_MONTHS = 1200;

const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthLabel = (index) =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
const emptyTotals = () => ({
  entryIds: [],
  gainsCents: 0n,
  expensesCents: 0n,
  activityDateUnconfirmedCount: 0,
  postedDateUnconfirmedCount: 0,
});
function include(totals, entry, amount) {
  totals.entryIds.push(entry.id);
  totals[entry.kind === 'gain' ? 'gainsCents' : 'expensesCents'] += amount;
  if (entry.activityDateUnconfirmed) totals.activityDateUnconfirmedCount++;
  if (entry.postedDateUnconfirmed) totals.postedDateUnconfirmedCount++;
}
function summarize(totals) {
  return {
    entryIds: totals.entryIds,
    count: totals.entryIds.length,
    gainsCents: exact(totals.gainsCents, 'Analysis Gain total'),
    expensesCents: exact(totals.expensesCents, 'Analysis Expense total'),
    netCents: exact(totals.gainsCents - totals.expensesCents, 'Analysis net'),
    activityDateUnconfirmedCount: totals.activityDateUnconfirmedCount,
    postedDateUnconfirmedCount: totals.postedDateUnconfirmedCount,
  };
}

/** Report an accepted, validated snapshot without changing its records or selection. */
export function analyzeEntries(snapshot, options = {}) {
  assertObject(options, 'Analysis options');
  const { entryIds, from, through } = options;
  assertDate(from, 'From activity date');
  assertDate(through, 'Through activity date');
  assert(from <= through, 'From activity date must not be after Through activity date.');
  const firstMonth = monthIndex(from),
    monthCount = monthIndex(through) - firstMonth + 1;
  assert(
    monthCount <= MAX_ANALYSIS_MONTHS,
    'Choose an activity date range covering at most 1,200 calendar months.',
  );
  assertArray(entryIds, 'Selected entry IDs');
  const selected = new Set(entryIds),
    ledger = snapshot.ledger,
    existing = new Set(ledger.entries.map((entry) => entry.id));
  for (const id of selected) {
    assertId(id, 'Selected entry ID');
    assert(existing.has(id), 'Analysis selection must reference existing entries.');
  }

  const totals = emptyTotals(),
    months = Array.from({ length: monthCount }, (_, index) => ({
      month: monthLabel(firstMonth + index),
      ...emptyTotals(),
    })),
    categories = new Map(ledger.categories.map((category) => [category.id, category])),
    grouped = { gain: new Map(), expense: new Map() };
  for (const entry of orderedEntries(ledger)) {
    if (!selected.has(entry.id) || entry.activityDate < from || entry.activityDate > through)
      continue;
    const amount = BigInt(cents(entry.amountCents, 'Entry amount', { positive: true }));
    include(totals, entry, amount);
    include(months[monthIndex(entry.activityDate) - firstMonth], entry, amount);
    const groups = grouped[entry.kind];
    if (!groups.has(entry.categoryId))
      groups.set(entry.categoryId, {
        categoryId: entry.categoryId,
        label: categories.get(entry.categoryId).label,
        entryIds: [],
        amountCents: 0n,
      });
    const group = groups.get(entry.categoryId);
    group.entryIds.push(entry.id);
    group.amountCents += amount;
  }

  const { count, ...summary } = summarize(totals);
  return {
    from,
    through,
    selectedCount: selected.size,
    includedCount: count,
    ...summary,
    months: months.map(({ month, ...values }) => ({ month, ...summarize(values) })),
    categories: Object.fromEntries(
      ['gain', 'expense'].map((kind) => {
        const denominator = kind === 'gain' ? summary.gainsCents : summary.expensesCents;
        const rows = [...grouped[kind].values()]
          .sort(
            (a, b) =>
              a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) ||
              a.categoryId.localeCompare(b.categoryId, 'en'),
          )
          .map(({ amountCents, ...group }) => ({
            ...group,
            count: group.entryIds.length,
            amountCents: exact(amountCents, 'Analysis category total'),
            share: denominator === 0 ? null : Number(amountCents) / denominator,
          }));
        return [kind, rows];
      }),
    ),
  };
}
