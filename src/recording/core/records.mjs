import {
  assert,
  clone,
  assertId,
  assertDate,
  assertArray,
  text,
  cents,
  metadata,
  validateMetadata,
  dateFlags,
  uniqueIds,
  allowedKeys,
  replace,
} from './values.mjs';

const ENTRY_KEYS = [
  'id',
  'kind',
  'categoryId',
  'accountId',
  'amountCents',
  'activityDate',
  'postedDate',
  'activityDateUnconfirmed',
  'postedDateUnconfirmed',
  'merchant',
  'note',
  'createdAt',
  'updatedAt',
];
const CATEGORY_KEYS = ['id', 'kind', 'label', 'createdAt', 'updatedAt'];
function kind(value) {
  assert(['gain', 'expense'].includes(value), 'Choose Gain or Expense.');
  return value;
}
export function normalizeCategory(value, previous) {
  allowedKeys(value, CATEGORY_KEYS, 'Category');
  return {
    ...metadata(value, previous, 'category'),
    kind: kind(value.kind),
    label: text(value.label, 'Category name', { max: 80 }),
  };
}
export function normalizeEntry(value, previous) {
  allowedKeys(value, ENTRY_KEYS, 'Entry');
  return {
    ...metadata(value, previous, 'entry'),
    kind: kind(value.kind),
    categoryId: assertId(value.categoryId, 'Category ID'),
    accountId: assertId(value.accountId, 'Account ID'),
    amountCents: cents(value.amountCents, 'Entry amount', { positive: true }),
    activityDate: assertDate(value.activityDate, 'Activity date'),
    postedDate: assertDate(value.postedDate, 'Posting date'),
    ...dateFlags(value, ['activityDateUnconfirmed', 'postedDateUnconfirmed']),
    merchant: text(value.merchant, 'Merchant or source', { optional: true, max: 200 }),
    note: text(value.note, 'Entry note', { optional: true }),
  };
}
export function validateRecords(ledger) {
  uniqueIds(ledger.categories, 'Categories');
  uniqueIds(ledger.entries, 'Entries');
  const categories = new Map();
  const labels = new Set();
  for (const category of ledger.categories) {
    validateMetadata(category);
    const normalized = normalizeCategory(category, category);
    const label = `${normalized.kind}:${normalized.label.toLocaleLowerCase('en-US')}`;
    assert(!labels.has(label), 'Category names must be unique within their type.');
    labels.add(label);
    categories.set(category.id, category);
  }
  for (const entry of ledger.entries) {
    validateMetadata(entry);
    normalizeEntry(entry, entry);
    const category = categories.get(entry.categoryId);
    assert(
      category && category.kind === entry.kind,
      'An entry must use an existing category of the same Gain/Expense type.',
    );
  }
  assertArray(ledger.entryOrder, 'Entry order');
  assert(
    ledger.entryOrder.length === ledger.entries.length &&
      new Set(ledger.entryOrder).size === ledger.entries.length &&
      ledger.entryOrder.every((id) => ledger.entries.some((entry) => entry.id === id)),
    'Entry order must contain every entry ID exactly once.',
  );
  return ledger;
}
export function orderedEntries(ledger, recordOrder = 'activity') {
  const byId = new Map(ledger.entries.map((entry) => [entry.id, entry]));
  const ordered = ledger.entryOrder.map((id) => byId.get(id)).filter(Boolean);
  // Stable sorting preserves the saved manual order within each activity date.
  return recordOrder === 'custom'
    ? ordered
    : ordered.sort((a, b) => b.activityDate.localeCompare(a.activityDate));
}
export function saveCategory(ledger, value) {
  const next = clone(ledger);
  const previous = next.categories.find((item) => item.id === value.id);
  const normalized = normalizeCategory(value, previous);
  next.categories = replace(next.categories, normalized);
  validateRecords(next);
  return next;
}
export function deleteCategory(ledger, id, replacementId) {
  const next = clone(ledger);
  const category = next.categories.find((item) => item.id === id);
  assert(category, 'Choose an existing category.');
  const entries = next.entries.filter((item) => item.categoryId === id);
  if (entries.length) {
    const replacement = next.categories.find(
      (item) => item.id === replacementId && item.id !== id && item.kind === category.kind,
    );
    assert(replacement, 'Choose a replacement category of the same type.');
    next.entries = next.entries.map((item) =>
      item.categoryId === id
        ? normalizeEntry({ ...item, categoryId: replacementId, updatedAt: undefined }, item)
        : item,
    );
  }
  next.categories = next.categories.filter((item) => item.id !== id);
  validateRecords(next);
  return next;
}
export function saveEntry(ledger, value) {
  const next = clone(ledger);
  const previous = next.entries.find((item) => item.id === value.id);
  const normalized = normalizeEntry(value, previous);
  next.entries = replace(next.entries, normalized);
  if (!previous) next.entryOrder.unshift(normalized.id);
  validateRecords(next);
  return next;
}
export function deleteEntry(ledger, id) {
  assert(
    ledger.entries.some((item) => item.id === id),
    'Choose an existing entry.',
  );
  const next = clone(ledger);
  next.entries = next.entries.filter((item) => item.id !== id);
  next.entryOrder = next.entryOrder.filter((item) => item !== id);
  validateRecords(next);
  return next;
}
