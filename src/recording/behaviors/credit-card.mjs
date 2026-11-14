import {
  assert,
  clone,
  assertId,
  assertDate,
  text,
  cents,
  metadata,
  validateMetadata,
  uniqueIds,
  allowedKeys,
  replace,
  exact,
  decimalCents,
  dayBefore,
} from '../core/values.mjs';
import { balanceAt, latestAccountDate } from '../core/account-ledger.mjs';
const KEYS = [
  'id',
  'accountId',
  'periodStart',
  'periodEnd',
  'openingBalanceCents',
  'closingBalanceCents',
  'expenseEntryIds',
  'sourceDocument',
  'note',
  'createdAt',
  'updatedAt',
];
export function normalizeStatement(value, previous) {
  allowedKeys(value, KEYS, 'Statement');
  const periodStart = assertDate(value.periodStart, 'Statement period start');
  const periodEnd = assertDate(value.periodEnd, 'Statement period end');
  assert(periodStart <= periodEnd, 'Statement period start must not be after its end.', {
    code: 'errors.behaviors.credit-card.statement-period-start-must-not-be-after-its-end',
  });
  assert(
    Array.isArray(value.expenseEntryIds) &&
      new Set(value.expenseEntryIds).size === value.expenseEntryIds.length,
    'Select each statement expense only once.',
    { code: 'errors.behaviors.credit-card.select-each-statement-expense-only-once' },
  );
  value.expenseEntryIds.forEach((id) => assertId(id, 'Statement expense ID'));
  return {
    ...metadata(value, previous, 'statement'),
    accountId: assertId(value.accountId, 'Card account ID'),
    periodStart,
    periodEnd,
    openingBalanceCents: cents(value.openingBalanceCents, 'Reported opening debt/credit'),
    closingBalanceCents: cents(value.closingBalanceCents, 'Reported closing debt/credit'),
    expenseEntryIds: [...value.expenseEntryIds],
    sourceDocument: text(value.sourceDocument, 'Statement source', { optional: true, max: 500 }),
    note: text(value.note, 'Statement note', { optional: true }),
  };
}
export function validateCreditCards(ledger) {
  uniqueIds(ledger.statements, 'Statements');
  const linked = new Set();
  for (const statement of ledger.statements) {
    validateMetadata(statement);
    normalizeStatement(statement, statement);
    const account = ledger.accounts.find((item) => item.id === statement.accountId);
    assert(
      account?.kind === 'credit_card',
      'A statement must reference an existing credit-card account.',
      {
        code: 'errors.behaviors.credit-card.a-statement-must-reference-an-existing-credit-card-account',
      },
    );
    assert(
      statement.periodStart >= account.openedDate,
      'A statement cycle cannot precede its card opening.',
      { code: 'errors.behaviors.credit-card.a-statement-cycle-cannot-precede-its-card-opening' },
    );
    assert(
      !ledger.statements.some(
        (other) =>
          other.id !== statement.id &&
          other.accountId === statement.accountId &&
          other.periodStart <= statement.periodEnd &&
          other.periodEnd >= statement.periodStart,
      ),
      'Statement cycles on the same card cannot overlap.',
      { code: 'errors.behaviors.credit-card.statement-cycles-on-the-same-card-cannot-overlap' },
    );
    const expectedEntries = ledger.entries.filter(
      (entry) =>
        entry.accountId === statement.accountId &&
        entry.kind === 'expense' &&
        entry.postedDate >= statement.periodStart &&
        entry.postedDate <= statement.periodEnd,
    );
    assert(
      expectedEntries.length === statement.expenseEntryIds.length &&
        expectedEntries.every((entry) => statement.expenseEntryIds.includes(entry.id)),
      'Statement links must include every Expense posted on this card in the cycle, and no others.',
      {
        code: 'errors.behaviors.credit-card.statement-links-must-include-every-expense-posted-on-this-card-in-the-cycle-and-no-o',
      },
    );
    for (const id of statement.expenseEntryIds) {
      assert(!linked.has(id), 'An Expense can belong to only one statement.', {
        code: 'errors.behaviors.credit-card.an-expense-can-belong-to-only-one-statement',
      });
      linked.add(id);
    }
    const opening = exact(
      -BigInt(balanceAt(ledger, account.id, dayBefore(statement.periodStart))),
      'Statement opening debt',
    );
    const closing = exact(
      -BigInt(balanceAt(ledger, account.id, statement.periodEnd)),
      'Statement closing debt',
    );
    assert(
      statement.openingBalanceCents === opening,
      `Statement opening balance does not reconcile: recorded history requires ${decimalCents(opening)}.`,
      {
        code: 'errors.behaviors.credit-card.statement-opening-balance-does-not-reconcile-recorded-history-requires',
        params: { p0: decimalCents(opening) },
      },
    );
    assert(
      statement.closingBalanceCents === closing,
      `Statement closing balance does not reconcile: recorded activity requires ${decimalCents(closing)}.`,
      {
        code: 'errors.behaviors.credit-card.statement-closing-balance-does-not-reconcile-recorded-activity-requires',
        params: { p0: decimalCents(closing) },
      },
    );
  }
  return ledger;
}
export function saveStatement(ledger, value) {
  const next = clone(ledger);
  const previous = next.statements.find((item) => item.id === value.id);
  next.statements = replace(next.statements, normalizeStatement(value, previous));
  validateCreditCards(next);
  return next;
}
export function deleteStatement(ledger, id) {
  assert(
    ledger.statements.some((item) => item.id === id),
    'Choose an existing statement.',
    { code: 'errors.behaviors.credit-card.choose-an-existing-statement' },
  );
  const next = clone(ledger);
  next.statements = next.statements.filter((item) => item.id !== id);
  validateCreditCards(next);
  return next;
}
export function cardSummary(ledger, accountId, { through = '' } = {}) {
  const account = ledger.accounts.find((item) => item.id === accountId);
  assert(account?.kind === 'credit_card', 'Choose an existing credit-card account.', {
    code: 'errors.behaviors.credit-card.choose-an-existing-credit-card-account',
  });
  const cutoff = through || latestAccountDate(ledger, accountId);
  const signedBalanceCents = balanceAt(ledger, accountId, cutoff);
  return {
    accountId,
    through: cutoff,
    signedBalanceCents,
    bookBalanceCents: signedBalanceCents,
    debtCents: Math.max(0, -signedBalanceCents),
    creditCents: Math.max(0, signedBalanceCents),
    statements: ledger.statements.filter((item) => item.accountId === accountId),
  };
}
