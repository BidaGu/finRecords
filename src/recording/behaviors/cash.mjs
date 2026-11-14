import { assert } from '../core/values.mjs';
import { accountLedger } from '../core/account-ledger.mjs';
export function cashSummary(ledger, accountId, options = {}) {
  const account = ledger.accounts.find((item) => item.id === accountId);
  assert(
    account && ['checking', 'savings', 'cd'].includes(account.kind),
    'Choose an existing cash account.',
    { code: 'errors.behaviors.cash.choose-an-existing-cash-account' },
  );
  const result = accountLedger(ledger, accountId, options);
  return { ...result, kind: account.kind, cashBalanceCents: result.closingBalanceCents };
}
