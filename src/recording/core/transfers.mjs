import {
  assert,
  clone,
  assertId,
  assertDate,
  text,
  cents,
  metadata,
  validateMetadata,
  dateFlags,
  uniqueIds,
  allowedKeys,
  replace,
} from './values.mjs';
const KEYS = [
  'id',
  'sourceAccountId',
  'targetAccountId',
  'amountCents',
  'sourcePostedDate',
  'targetPostedDate',
  'activityDate',
  'sourcePostedDateUnconfirmed',
  'targetPostedDateUnconfirmed',
  'activityDateUnconfirmed',
  'note',
  'createdAt',
  'updatedAt',
];
export function normalizeTransfer(value, previous) {
  allowedKeys(value, KEYS, 'Transfer');
  const sourceAccountId = assertId(value.sourceAccountId, 'Source account ID');
  const targetAccountId = assertId(value.targetAccountId, 'Destination account ID');
  assert(sourceAccountId !== targetAccountId, 'Choose two different accounts for a transfer.', {
    code: 'errors.core.transfers.choose-two-different-accounts-for-a-transfer',
  });
  const result = {
    ...metadata(value, previous, 'transfer'),
    sourceAccountId,
    targetAccountId,
    amountCents: cents(value.amountCents, 'Transfer amount', { positive: true }),
    sourcePostedDate: assertDate(value.sourcePostedDate, 'Source posting date'),
    targetPostedDate: assertDate(value.targetPostedDate, 'Destination posting date'),
    ...dateFlags(value, [
      'sourcePostedDateUnconfirmed',
      'targetPostedDateUnconfirmed',
      'activityDateUnconfirmed',
    ]),
    note: text(value.note, 'Transfer note', { optional: true }),
  };
  if (value.activityDate !== undefined && value.activityDate !== '')
    result.activityDate = assertDate(value.activityDate, 'Activity date');
  assert(
    !result.activityDateUnconfirmed || result.activityDate,
    'An unconfirmed activity date still needs a real activity date.',
    { code: 'errors.core.transfers.an-unconfirmed-activity-date-still-needs-a-real-activity-date' },
  );
  return result;
}
export function validateTransfers(ledger) {
  uniqueIds(ledger.transfers, 'Transfers');
  const accounts = new Map(ledger.accounts.map((item) => [item.id, item]));
  for (const transfer of ledger.transfers) {
    validateMetadata(transfer);
    normalizeTransfer(transfer, transfer);
    const source = accounts.get(transfer.sourceAccountId);
    const target = accounts.get(transfer.targetAccountId);
    assert(source && target, 'A transfer must reference two existing accounts.', {
      code: 'errors.core.transfers.a-transfer-must-reference-two-existing-accounts',
    });
    assert(
      transfer.sourcePostedDate >= source.openedDate,
      'Source posting date cannot precede the source account opening.',
      {
        code: 'errors.core.transfers.source-posting-date-cannot-precede-the-source-account-opening',
      },
    );
    assert(
      transfer.targetPostedDate >= target.openedDate,
      'Destination posting date cannot precede the destination account opening.',
      {
        code: 'errors.core.transfers.destination-posting-date-cannot-precede-the-destination-account-opening',
      },
    );
  }
  return ledger;
}
export function saveTransfer(ledger, value) {
  const next = clone(ledger);
  const previous = next.transfers.find((item) => item.id === value.id);
  next.transfers = replace(next.transfers, normalizeTransfer(value, previous));
  validateTransfers(next);
  return next;
}
export function deleteTransfer(ledger, id) {
  assert(
    ledger.transfers.some((item) => item.id === id),
    'Choose an existing transfer.',
    { code: 'errors.core.transfers.choose-an-existing-transfer' },
  );
  const next = clone(ledger);
  next.transfers = next.transfers.filter((item) => item.id !== id);
  validateTransfers(next);
  return next;
}
