import {
  assert,
  assertArray,
  assertDate,
  assertId,
  assertObject,
  exact,
  ValidationError,
} from '../core/values.mjs';
import { ACCOUNT_KINDS } from '../core/accounts.mjs';
import { balanceAt } from '../core/account-ledger.mjs';
import { cardSummary } from '../behaviors/credit-card.mjs';
import { investmentSummary } from '../behaviors/investment.mjs';

function postingCounts(ledger, selected, through) {
  const counts = new Map([...selected].map((id) => [id, 0]));
  const include = (accountId, date, unconfirmed) => {
    if (selected.has(accountId) && date <= through && unconfirmed)
      counts.set(accountId, counts.get(accountId) + 1);
  };
  for (const entry of ledger.entries)
    include(entry.accountId, entry.postedDate, entry.postedDateUnconfirmed);
  for (const transfer of ledger.transfers) {
    include(
      transfer.sourceAccountId,
      transfer.sourcePostedDate,
      transfer.sourcePostedDateUnconfirmed,
    );
    include(
      transfer.targetAccountId,
      transfer.targetPostedDate,
      transfer.targetPostedDateUnconfirmed,
    );
  }
  for (const purchase of ledger.holdings)
    include(purchase.accountId, purchase.postedDate, purchase.postedDateUnconfirmed);
  for (const disposal of ledger.investmentActivities)
    include(disposal.accountId, disposal.postedDate, disposal.postedDateUnconfirmed);
  return counts;
}
function recordedValues(ledger, account, through) {
  if (through < account.openedDate)
    return {
      bookBalanceCents: 0,
      cashBalanceCents: account.kind === 'credit_card' ? null : 0,
      holdingsCostCents: 0,
    };
  if (account.kind === 'investment') {
    const { bookBalanceCents, cashBalanceCents, holdingsCostCents } = investmentSummary(
      ledger,
      account.id,
      { through },
    );
    return { bookBalanceCents, cashBalanceCents, holdingsCostCents };
  }
  if (account.kind === 'credit_card')
    return {
      bookBalanceCents: cardSummary(ledger, account.id, { through }).bookBalanceCents,
      cashBalanceCents: null,
      holdingsCostCents: 0,
    };
  const bookBalanceCents = balanceAt(ledger, account.id, through);
  return { bookBalanceCents, cashBalanceCents: bookBalanceCents, holdingsCostCents: 0 };
}
function sumAccounts(accounts) {
  let assets = 0n,
    liabilities = 0n,
    postedDateUnconfirmedCount = 0;
  for (const account of accounts) {
    assets += BigInt(account.assetsCents);
    liabilities += BigInt(account.liabilitiesCents);
    postedDateUnconfirmedCount += account.postedDateUnconfirmedCount;
  }
  return {
    assetsCents: exact(assets, 'Recorded asset total'),
    liabilitiesCents: exact(liabilities, 'Recorded liability total'),
    netAssetsCents: exact(assets - liabilities, 'Recorded net assets'),
    postedDateUnconfirmedCount,
  };
}
const shares = (row, totals) => ({
  assetShare: totals.assetsCents === 0 ? null : row.assetsCents / totals.assetsCents,
  liabilityShare:
    totals.liabilitiesCents === 0 ? null : row.liabilitiesCents / totals.liabilitiesCents,
});

const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthLabel = (index) =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
function monthEnd(index) {
  const year = Math.floor(index / 12),
    month = (index % 12) + 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return `${monthLabel(index)}-${days}`;
}
function accountHistory(ledger, metadata, accounts, through) {
  const empty = { from: null, through, months: [], error: null };
  let firstOpening = null;
  for (const account of metadata)
    if (account.openedDate <= through && (!firstOpening || account.openedDate < firstOpening))
      firstOpening = account.openedDate;
  if (!firstOpening) return empty;
  const last = monthIndex(through),
    windowStart = Math.max(12, last - 11),
    from =
      firstOpening > `${monthLabel(windowStart)}-01`
        ? firstOpening
        : `${monthLabel(windowStart)}-01`,
    kinds = ACCOUNT_KINDS.filter((kind) => metadata.some((account) => account.kind === kind)),
    months = [];
  for (let index = monthIndex(from); index <= last; index++) {
    const month = monthLabel(index),
      cutoff = index === last ? through : monthEnd(index);
    const byType = new Map(kinds.map((kind) => [kind, { assets: 0n, liabilities: 0n }]));
    let totalAssets = 0n,
      totalLiabilities = 0n;
    for (let at = 0; at < metadata.length; at++) {
      const account = metadata[at];
      const balance =
        index === last
          ? accounts[at].bookBalanceCents
          : recordedValues(ledger, account, cutoff).bookBalanceCents;
      const assets = BigInt(Math.max(0, balance)),
        liabilities = BigInt(Math.max(0, -balance)),
        type = byType.get(account.kind);
      totalAssets += assets;
      totalLiabilities += liabilities;
      type.assets += assets;
      type.liabilities += liabilities;
    }
    // Only expected checked-aggregate failures make history unavailable; other errors propagate.
    let assetsCents, liabilitiesCents, types;
    try {
      assetsCents = exact(totalAssets, `Recorded asset history for ${month}`);
      liabilitiesCents = exact(totalLiabilities, `Recorded liability history for ${month}`);
      types = kinds.map((kind) => ({
        kind,
        assetsCents: exact(byType.get(kind).assets, `Recorded ${kind} asset history for ${month}`),
        liabilitiesCents: exact(
          byType.get(kind).liabilities,
          `Recorded ${kind} liability history for ${month}`,
        ),
      }));
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      return {
        from,
        through,
        months: [],
        error: error.message,
        errorCode: error.code,
        errorParams: error.params,
      };
    }
    months.push({ month, through: cutoff, assetsCents, liabilitiesCents, types });
  }
  return { from, through, months, error: null };
}

/** Report complete posted history from an accepted snapshot at one explicit common cutoff. */
export function analyzeAccounts(snapshot, options = {}) {
  assertObject(options, 'Account analysis options');
  const { accountIds, through } = options;
  assertDate(through, 'Posting cutoff');
  assertArray(accountIds, 'Selected account IDs');
  const ledger = snapshot.ledger,
    selected = new Set(accountIds),
    existing = new Set(ledger.accounts.map((account) => account.id));
  for (const id of selected) {
    assertId(id, 'Selected account ID');
    assert(existing.has(id), 'Account analysis selection must reference existing accounts.', {
      code: 'errors.analysis.account-analysis.account-analysis-selection-must-reference-existing-accounts',
    });
  }
  const counts = postingCounts(ledger, selected, through);
  const metadata = ledger.accounts
    .filter((account) => selected.has(account.id))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id, 'en'),
    );
  const accounts = metadata.map((account) => {
    const values = recordedValues(ledger, account, through);
    return {
      accountId: account.id,
      kind: account.kind,
      ...values,
      assetsCents: Math.max(0, values.bookBalanceCents),
      liabilitiesCents: Math.max(0, -values.bookBalanceCents),
      postedDateUnconfirmedCount: counts.get(account.id),
    };
  });
  const totals = sumAccounts(accounts);
  const types = ACCOUNT_KINDS.flatMap((kind) => {
    const members = accounts.filter((account) => account.kind === kind);
    if (!members.length) return [];
    const values = sumAccounts(members);
    return [
      {
        kind,
        accountIds: members.map((account) => account.accountId),
        accountCount: members.length,
        ...values,
        ...shares(values, totals),
      },
    ];
  });
  return {
    through,
    selectedCount: selected.size,
    accountIds: accounts.map((account) => account.accountId),
    ...totals,
    accounts: accounts.map((account) => ({ ...account, ...shares(account, totals) })),
    types,
    history: accountHistory(ledger, metadata, accounts, through),
  };
}
