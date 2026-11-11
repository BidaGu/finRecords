export const RECORDING_FORMAT = 'finance-recording';
export const RECORDING_VERSION = '1.0.0';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
export function assert(condition, message) {
  if (!condition) throw new ValidationError(message);
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
  assert(validDate(value), `${label} must be a real date.`);
  return value;
}
export function assertObject(value, label = 'Record') {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object.`,
  );
  return value;
}
export function assertArray(value, label = 'Records') {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value;
}
export function assertId(value, label = 'ID') {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 160 &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value),
    `${label} must be a valid stable ID.`,
  );
  return value;
}
export function text(value, label = 'Text', { optional = false, max = 2000 } = {}) {
  if (value === undefined && optional) return '';
  assert(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  assert(
    result.length <= max && (optional || result.length > 0),
    `${label} must ${optional ? '' : 'not be blank and must '}contain at most ${max} characters.`,
  );
  return result;
}
export function cents(value, label = 'Amount', { positive = false } = {}) {
  assert(
    Number.isSafeInteger(value) && (!positive || value > 0),
    `${label} must be ${positive ? 'positive ' : ''}whole cents within the exact supported range.`,
  );
  return Object.is(value, -0) ? 0 : value;
}
export function exact(value, label = 'Result') {
  const n = Number(value);
  assert(
    Number.isSafeInteger(n) && BigInt(n) === BigInt(value),
    `${label} exceeds the exact supported cent range.`,
  );
  return n || 0;
}
export function decimalCents(value) {
  const integer = BigInt(cents(value, 'Amount'));
  const magnitude = integer < 0n ? -integer : integer;
  return `${integer < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
export function toCents(value) {
  assert(typeof value === 'string' || typeof value === 'number', 'Enter an amount.');
  const s = String(value).trim();
  assert(/^-?\d+(?:\.\d{1,2})?$/.test(s), 'Enter an amount with at most two decimal places.');
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
      assert(typeof source[name] === 'boolean', `${name} must be a checkbox value.`);
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
    assert(validTimestamp(value), `${label} must be valid.`);
  }
  return { id, createdAt, updatedAt };
}
export function validateMetadata(source) {
  assertId(source.id);
  for (const key of ['createdAt', 'updatedAt'])
    assert(validTimestamp(source[key]), `${key} must be a valid timestamp.`);
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
    assert(!ids.has(item.id), `${label} contains a duplicate ID.`);
    ids.add(item.id);
  }
}
export function allowedKeys(source, allowed, label) {
  assertObject(source, label);
  for (const key of Object.keys(source))
    assert(allowed.includes(key), `${label} contains unsupported field “${key}”.`);
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
