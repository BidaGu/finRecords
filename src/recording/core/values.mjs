export const RECORDING_FORMAT = 'finance-recording';
export const RECORDING_VERSION = '1.0.0';
export const SUPPORTED_CURRENCIES = Object.freeze(['USD', 'CNY']);
export const MONEY_SCALE = 100;

export class ValidationError extends Error {
  constructor(message, { code = 'errors.validation', params = {} } = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.params = Object.freeze({ ...params });
  }
}
export function assert(condition, message, descriptor) {
  if (!condition) throw new ValidationError(message, descriptor);
}
export function assertCurrency(value) {
  assert(SUPPORTED_CURRENCIES.includes(value), 'Choose a supported currency (USD or CNY).', {
    code: 'errors.currency.unsupported',
  });
  return value;
}

// Fixed field identifiers retain the English helper-label API without localizing Core.
const FIELD_IDS = Object.freeze({
  Account: 'account',
  'Account ID': 'account-id',
  'Account analysis options': 'account-analysis-options',
  'Account balance': 'account-balance',
  'Account closing balance': 'account-closing-balance',
  'Account dated balance': 'account-dated-balance',
  'Account name': 'account-name',
  'Account note': 'account-note',
  'Account opening date': 'account-opening-date',
  'Account suffix or alias': 'account-suffix-or-alias',
  Accounts: 'accounts',
  'Active holdings cost': 'active-holdings-cost',
  'Activity date': 'activity-date',
  'Actual proceeds': 'actual-proceeds',
  'Additional shares': 'additional-shares',
  'All-record Expense total': 'all-record-expense-total',
  'All-record Gain total': 'all-record-gain-total',
  'All-transfer total': 'all-transfer-total',
  Amount: 'amount',
  'Analysis Expense total': 'analysis-expense-total',
  'Analysis Gain total': 'analysis-gain-total',
  'Analysis category total': 'analysis-category-total',
  'Analysis net': 'analysis-net',
  'Analysis options': 'analysis-options',
  'Analysis preset': 'analysis-preset',
  'Analysis presets': 'analysis-presets',
  'Average After Purchase inputs': 'average-after-purchase-inputs',
  'Balance cutoff': 'balance-cutoff',
  CUSIP: 'cusip',
  'Card account ID': 'card-account-id',
  Categories: 'categories',
  Category: 'category',
  'Category ID': 'category-id',
  'Category name': 'category-name',
  'Compound Growth inputs': 'compound-growth-inputs',
  'Contract maturity': 'contract-maturity',
  'Created timestamp': 'created-timestamp',
  'Current average price': 'current-average-price',
  'Current cost': 'current-cost',
  'Current cost basis': 'current-cost-basis',
  'Current shares': 'current-shares',
  'Daily closing balance': 'daily-closing-balance',
  'Daily opening balance': 'daily-opening-balance',
  Date: 'date',
  'Destination account ID': 'destination-account-id',
  'Destination posting date': 'destination-posting-date',
  Document: 'document',
  Entries: 'entries',
  Entry: 'entry',
  'Entry amount': 'entry-amount',
  'Entry note': 'entry-note',
  'Entry order': 'entry-order',
  'Face value': 'face-value',
  'Financial ledger': 'financial-ledger',
  'Fractional share increment': 'fractional-share-increment',
  'From activity date': 'from-activity-date',
  'From date': 'from-date',
  'Gain/loss before fees': 'gain-loss-before-fees',
  'Gross proceeds': 'gross-proceeds',
  Holding: 'holding',
  'Holding ID': 'holding-id',
  'Holding name': 'holding-name',
  'Holding note': 'holding-note',
  Holdings: 'holdings',
  'Holdings cost': 'holdings-cost',
  ID: 'id',
  'Initial amount': 'initial-amount',
  Institution: 'institution',
  'Investment account ID': 'investment-account-id',
  'Investment activities': 'investment-activities',
  'Investment activity': 'investment-activity',
  'Investment activity date': 'investment-activity-date',
  'Investment activity form': 'investment-activity-form',
  'Investment activity note': 'investment-activity-note',
  'Investment cash': 'investment-cash',
  'Investment cutoff': 'investment-cutoff',
  'Investment posting date': 'investment-posting-date',
  'Merchant or source': 'merchant-or-source',
  'Net gain/loss': 'net-gain-loss',
  'Net proceeds': 'net-proceeds',
  'Posting cutoff': 'posting-cutoff',
  'Posting date': 'posting-date',
  'Preset ID': 'preset-id',
  'Preset entry IDs': 'preset-entry-ids',
  'Purchase activity date': 'purchase-activity-date',
  'Purchase cost': 'purchase-cost',
  'Purchase posting date': 'purchase-posting-date',
  'Purchase price': 'purchase-price',
  'Realized interest': 'realized-interest',
  'Realized result': 'realized-result',
  'Realized result entry ID': 'realized-result-entry-id',
  Record: 'record',
  'Recorded asset total': 'recorded-asset-total',
  'Recorded liability total': 'recorded-liability-total',
  'Recorded net assets': 'recorded-net-assets',
  Records: 'records',
  'Redemption proceeds': 'redemption-proceeds',
  'Regular contribution': 'regular-contribution',
  'Remaining cost basis': 'remaining-cost-basis',
  'Reported closing debt/credit': 'reported-closing-debt-credit',
  'Reported opening debt/credit': 'reported-opening-debt-credit',
  Result: 'result',
  'Sale price': 'sale-price',
  'Selected account ID': 'selected-account-id',
  'Selected account IDs': 'selected-account-ids',
  'Selected entries': 'selected-entries',
  'Selected entry ID': 'selected-entry-id',
  'Selected entry IDs': 'selected-entry-ids',
  'Selection settings': 'selection-settings',
  'Selling fees': 'selling-fees',
  'Sold cost basis': 'sold-cost-basis',
  'Source account ID': 'source-account-id',
  'Source posting date': 'source-posting-date',
  Statement: 'statement',
  'Statement closing debt': 'statement-closing-debt',
  'Statement expense ID': 'statement-expense-id',
  'Statement note': 'statement-note',
  'Statement opening debt': 'statement-opening-debt',
  'Statement period end': 'statement-period-end',
  'Statement period start': 'statement-period-start',
  'Statement source': 'statement-source',
  Statements: 'statements',
  'Stock sale inputs': 'stock-sale-inputs',
  'Target Average Cost inputs': 'target-average-cost-inputs',
  'Target average price': 'target-average-price',
  Text: 'text',
  'Through activity date': 'through-activity-date',
  'Through date': 'through-date',
  'Total cost': 'total-cost',
  'Total remaining shares': 'total-remaining-shares',
  'Total shares held': 'total-shares-held',
  'Total shares to sell': 'total-shares-to-sell',
  Transfer: 'transfer',
  'Transfer amount': 'transfer-amount',
  'Transfer note': 'transfer-note',
  Transfers: 'transfers',
  'Updated timestamp': 'updated-timestamp',
});
export function fieldDescriptor(label) {
  const text = String(label);
  const lot = text.match(/^Lot (\d+)(?: (.+))?$/);
  if (lot)
    return {
      field: lot[2]
        ? 'stock-lot-' +
          lot[2]
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
        : 'stock-lot',
      label: text,
      index: Number(lot[1]),
    };
  const history = text.match(/^Recorded (?:(\w+) )?(asset|liability) history for (\d{4}-\d{2})$/);
  if (history)
    return {
      field: `recorded-${history[1] ? 'typed-' : ''}${history[2]}-history`,
      label: text,
      kind: history[1] ?? '',
      month: history[3],
    };
  return { field: Object.hasOwn(FIELD_IDS, text) ? FIELD_IDS[text] : '', label: text };
}

export function clone(value) {
  return structuredClone(value);
}
export function now() {
  return new Date().toISOString();
}
export function today() {
  const d = new Date();
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function uid(prefix = 'record') {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function assertDate(value, label = 'Date') {
  assert(validDate(value), `${label} must be a real date.`, {
    code: 'errors.core.values.must-be-a-real-date',
    params: { label: label, ...fieldDescriptor(label) },
  });
  return value;
}
export function assertObject(value, label = 'Record') {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object.`,
    {
      code: 'errors.core.values.must-be-an-object',
      params: { label: label, ...fieldDescriptor(label) },
    },
  );
  return value;
}
export function assertArray(value, label = 'Records') {
  assert(Array.isArray(value), `${label} must be an array.`, {
    code: 'errors.core.values.must-be-an-array',
    params: { label: label, ...fieldDescriptor(label) },
  });
  return value;
}
export function assertId(value, label = 'ID') {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 160 &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value),
    `${label} must be a valid stable ID.`,
    {
      code: 'errors.core.values.must-be-a-valid-stable-id',
      params: { label: label, ...fieldDescriptor(label) },
    },
  );
  return value;
}
export function text(value, label = 'Text', { optional = false, max = 2000 } = {}) {
  if (value === undefined && optional) return '';
  assert(typeof value === 'string', `${label} must be text.`, {
    code: 'errors.core.values.must-be-text',
    params: { label: label, ...fieldDescriptor(label) },
  });
  const result = value.trim();
  assert(
    result.length <= max && (optional || result.length > 0),
    `${label} must ${optional ? '' : 'not be blank and must '}contain at most ${max} characters.`,
    {
      code: optional
        ? 'errors.core.values.must-contain-at-most-characters.optional'
        : 'errors.core.values.must-contain-at-most-characters.required',
      params: { max, ...fieldDescriptor(label) },
    },
  );
  return result;
}
export function cents(value, label = 'Amount', { positive = false } = {}) {
  assert(
    Number.isSafeInteger(value) && (!positive || value > 0),
    `${label} must be ${positive ? 'positive ' : ''}whole cents within the exact supported range.`,
    {
      code: positive
        ? 'errors.core.values.must-be-whole-cents-within-the-exact-supported-range.positive'
        : 'errors.core.values.must-be-whole-cents-within-the-exact-supported-range.signed',
      params: fieldDescriptor(label),
    },
  );
  return Object.is(value, -0) ? 0 : value;
}
export function exact(value, label = 'Result') {
  const n = Number(value);
  assert(
    Number.isSafeInteger(n) && BigInt(n) === BigInt(value),
    `${label} exceeds the exact supported cent range.`,
    {
      code: 'errors.core.values.exceeds-the-exact-supported-cent-range',
      params: { label: label, ...fieldDescriptor(label) },
    },
  );
  return n || 0;
}
export function decimalCents(value) {
  const integer = BigInt(cents(value, 'Amount'));
  const magnitude = integer < 0n ? -integer : integer;
  return `${integer < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
export function toCents(value) {
  assert(typeof value === 'string' || typeof value === 'number', 'Enter an amount.', {
    code: 'errors.core.values.enter-an-amount',
  });
  const s = String(value).trim();
  assert(/^-?\d+(?:\.\d{1,2})?$/.test(s), 'Enter an amount with at most two decimal places.', {
    code: 'errors.core.values.enter-an-amount-with-at-most-two-decimal-places',
  });
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = (negative ? s.slice(1) : s).split('.');
  return exact(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n),
    'Amount',
  );
}
export function dateFlags(source, names) {
  const result = {};
  for (const name of names)
    if (Object.hasOwn(source, name)) {
      assert(typeof source[name] === 'boolean', `${name} must be a checkbox value.`, {
        code: 'errors.core.values.must-be-a-checkbox-value',
        params: { name: name },
      });
      if (source[name]) result[name] = true;
    }
  return result;
}
export function metadata(source, previous, prefix) {
  const stamp = now();
  const id = source.id ?? previous?.id ?? uid(prefix);
  assertId(id);
  const createdAt = previous?.createdAt ?? source.createdAt ?? stamp;
  const updatedAt = source.updatedAt ?? stamp;
  for (const [label, value] of [
    ['Created timestamp', createdAt],
    ['Updated timestamp', updatedAt],
  ]) {
    assert(validTimestamp(value), `${label} must be valid.`, {
      code: 'errors.core.values.must-be-valid',
      params: { label: label, ...fieldDescriptor(label) },
    });
  }
  return { id, createdAt, updatedAt };
}
export function validateMetadata(source) {
  assertId(source.id);
  for (const key of ['createdAt', 'updatedAt'])
    assert(validTimestamp(source[key]), `${key} must be a valid timestamp.`, {
      code: 'errors.core.values.must-be-a-valid-timestamp',
      params: { key: key },
    });
}
export function validTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    validDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value)) &&
    Number(value.slice(11, 13)) < 24
  );
}
export function uniqueIds(items, label) {
  assertArray(items, label);
  const ids = new Set();
  for (const item of items) {
    assertObject(item, label);
    assertId(item.id);
    assert(!ids.has(item.id), `${label} contains a duplicate ID.`, {
      code: 'errors.core.values.contains-a-duplicate-id',
      params: { label: label, ...fieldDescriptor(label) },
    });
    ids.add(item.id);
  }
}
export function allowedKeys(source, allowed, label) {
  assertObject(source, label);
  for (const key of Object.keys(source))
    assert(allowed.includes(key), `${label} contains unsupported field “${key}”.`, {
      code: 'errors.core.values.contains-unsupported-field',
      params: { label: label, key: key, ...fieldDescriptor(label) },
    });
}
export function replace(items, value) {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => (item.id === value.id ? value : item))
    : [...items, value];
}
export function dayBefore(date) {
  assertDate(date);
  if (date === '0001-01-01') return '';
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function nextDay(date) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
