import {
  assert,
  clone,
  assertDate,
  text,
  metadata,
  validateMetadata,
  uniqueIds,
  allowedKeys,
  replace,
} from './values.mjs';
export const ACCOUNT_KINDS = ['checking', 'savings', 'cd', 'investment', 'credit_card'];
const KEYS = [
  'id',
  'name',
  'kind',
  'openedDate',
  'closed',
  'aliases',
  'institution',
  'note',
  'createdAt',
  'updatedAt',
];
export function normalizeAccount(value, previous) {
  allowedKeys(value, KEYS, 'Account');
  assert(ACCOUNT_KINDS.includes(value.kind), 'Choose a supported account type.');
  assert(
    value.closed === undefined || typeof value.closed === 'boolean',
    'Closed must be a checkbox value.',
  );
  assert(
    value.aliases === undefined || Array.isArray(value.aliases),
    'Account aliases must be a list.',
  );
  const aliases = (value.aliases ?? []).map((alias) =>
    text(alias, 'Account suffix or alias', { max: 80 }),
  );
  assert(new Set(aliases).size === aliases.length, 'Account suffixes/aliases must be unique.');
  return {
    ...metadata(value, previous, 'account'),
    name: text(value.name, 'Account name', { max: 100 }),
    kind: value.kind,
    openedDate: assertDate(value.openedDate, 'Account opening date'),
    closed: Boolean(value.closed),
    aliases,
    institution: text(value.institution, 'Institution', { optional: true, max: 100 }),
    note: text(value.note, 'Account note', { optional: true }),
  };
}
export function validateAccounts(ledger) {
  uniqueIds(ledger.accounts, 'Accounts');
  for (const account of ledger.accounts) {
    validateMetadata(account);
    normalizeAccount(account, account);
  }
  return ledger;
}
export function saveAccount(ledger, value) {
  const next = clone(ledger);
  const previous = next.accounts.find((item) => item.id === value.id);
  next.accounts = replace(next.accounts, normalizeAccount(value, previous));
  validateAccounts(next);
  return next;
}
export function deleteAccount(ledger, id) {
  assert(
    ledger.accounts.some((item) => item.id === id),
    'Choose an existing account.',
  );
  const next = clone(ledger);
  next.accounts = next.accounts.filter((item) => item.id !== id);
  validateAccounts(next);
  return next;
}
