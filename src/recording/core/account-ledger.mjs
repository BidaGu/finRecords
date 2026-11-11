import { assert, assertDate, cents, exact, dayBefore, nextDay } from './values.mjs';

function accountFor(ledger, id) {
  const account = ledger.accounts.find((item) => item.id === id);
  assert(account, 'Choose an existing account.');
  return account;
}
function postedMovements(ledger, accountId) {
  const rows = [];
  for (const entry of ledger.entries)
    if (entry.accountId === accountId) {
      const amount = cents(entry.amountCents, 'Entry amount', { positive: true });
      rows.push({
        date: assertDate(entry.postedDate, 'Posting date'),
        kind: entry.kind === 'gain' ? 'gainsCents' : 'expensesCents',
        amount,
        entryId: entry.id,
      });
    }
  for (const transfer of ledger.transfers) {
    const amount = cents(transfer.amountCents, 'Transfer amount', { positive: true });
    if (transfer.sourceAccountId === accountId)
      rows.push({
        date: assertDate(transfer.sourcePostedDate, 'Source posting date'),
        kind: 'outgoingCents',
        amount,
        transferId: transfer.id,
      });
    if (transfer.targetAccountId === accountId)
      rows.push({
        date: assertDate(transfer.targetPostedDate, 'Destination posting date'),
        kind: 'incomingCents',
        amount,
        transferId: transfer.id,
      });
  }
  return rows;
}
const direction = (kind) => (['gainsCents', 'incomingCents'].includes(kind) ? 1n : -1n);
export function balanceAt(ledger, accountId, through) {
  accountFor(ledger, accountId);
  if (through === '') return 0;
  assertDate(through, 'Balance cutoff');
  let balance = 0n;
  for (const row of postedMovements(ledger, accountId))
    if (row.date <= through) balance += direction(row.kind) * BigInt(row.amount);
  return exact(balance, 'Account balance');
}
/** Validate all amounts a permitted ledger range/filter can expose, without materializing calendar rows. */
export function validateAccountBalances(ledger) {
  let globalGains = 0n;
  let globalExpenses = 0n;
  let globalTransfers = 0n;
  for (const entry of ledger.entries) {
    if (entry.kind === 'gain') globalGains += BigInt(entry.amountCents);
    else globalExpenses += BigInt(entry.amountCents);
  }
  for (const transfer of ledger.transfers) globalTransfers += BigInt(transfer.amountCents);
  exact(globalGains, 'All-record Gain total');
  exact(globalExpenses, 'All-record Expense total');
  exact(globalTransfers, 'All-transfer total');
  for (const account of ledger.accounts) {
    const rows = postedMovements(ledger, account.id).sort((a, b) => a.date.localeCompare(b.date));
    const totals = emptySums();
    let balance = 0n;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      totals[row.kind] += BigInt(row.amount);
      balance += direction(row.kind) * BigInt(row.amount);
      if (!rows[i + 1] || rows[i + 1].date !== row.date) exact(balance, 'Account dated balance');
    }
    finalSums(totals);
  }
  return ledger;
}
function emptySums() {
  return { gainsCents: 0n, expensesCents: 0n, incomingCents: 0n, outgoingCents: 0n };
}
function finalSums(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, exact(value, key)]));
}
export function latestAccountDate(ledger, accountId) {
  const account = accountFor(ledger, accountId);
  let last = account.openedDate;
  for (const row of postedMovements(ledger, accountId)) if (row.date > last) last = row.date;
  for (const row of [...(ledger.holdings ?? []), ...(ledger.investmentActivities ?? [])])
    if (row.accountId === accountId && row.postedDate > last) last = row.postedDate;
  return last;
}
export function accountLedger(ledger, accountId, options = {}) {
  const account = accountFor(ledger, accountId);
  assert(
    options && typeof options === 'object' && !Array.isArray(options),
    'Choose a valid balance date range.',
  );
  const from = options.from || account.openedDate;
  const through = options.through || latestAccountDate(ledger, accountId);
  assertDate(from, 'From date');
  assertDate(through, 'Through date');
  assert(from <= through, 'From date must not be after Through date.');
  const dayCount =
    Math.round((Date.parse(`${through}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) +
    1;
  assert(dayCount <= 50000, 'Choose an account review range shorter than 50,000 days.');
  const openingBalanceCents = balanceAt(ledger, accountId, dayBefore(from));
  const byDate = new Map();
  for (const row of postedMovements(ledger, accountId))
    if (row.date >= from && row.date <= through) {
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date).push(row);
    }
  const days = [];
  const months = [];
  const totals = emptySums();
  let running = BigInt(openingBalanceCents);
  let month = null;
  for (let date = from; ; date = nextDay(date)) {
    const rows = byDate.get(date) ?? [];
    const sums = emptySums();
    const opening = exact(running, 'Daily opening balance');
    const entryIds = [];
    const transferIds = [];
    for (const row of rows) {
      sums[row.kind] += BigInt(row.amount);
      totals[row.kind] += BigInt(row.amount);
      running += direction(row.kind) * BigInt(row.amount);
      if (row.entryId) entryIds.push(row.entryId);
      if (row.transferId) transferIds.push(row.transferId);
    }
    const day = {
      date,
      period: date,
      startDate: date,
      endDate: date,
      openingBalanceCents: opening,
      ...finalSums(sums),
      closingBalanceCents: exact(running, 'Daily closing balance'),
      entryIds,
      transferIds,
      activityCount: rows.length,
    };
    days.push(day);
    const period = date.slice(0, 7);
    if (!month || month.period !== period) {
      month = {
        period,
        date: period,
        startDate: date,
        endDate: date,
        openingBalanceCents: opening,
        gainsCents: 0n,
        expensesCents: 0n,
        incomingCents: 0n,
        outgoingCents: 0n,
        closingBalanceCents: day.closingBalanceCents,
        entryIds: [],
        transferIds: [],
        activityCount: 0,
      };
      months.push(month);
    }
    for (const key of Object.keys(sums)) month[key] += sums[key];
    month.endDate = date;
    month.closingBalanceCents = day.closingBalanceCents;
    month.entryIds.push(...entryIds);
    month.transferIds.push(...transferIds);
    month.activityCount += rows.length;
    if (date === through) break;
  }
  const result = {
    accountId,
    from,
    through,
    startDate: from,
    endDate: through,
    openingBalanceCents,
    ...finalSums(totals),
    closingBalanceCents: exact(running, 'Account closing balance'),
    days,
    months: months.map((row) => ({
      ...row,
      ...finalSums({
        gainsCents: row.gainsCents,
        expensesCents: row.expensesCents,
        incomingCents: row.incomingCents,
        outgoingCents: row.outgoingCents,
      }),
    })),
  };
  return {
    ...result,
    totalGainsCents: result.gainsCents,
    totalExpensesCents: result.expensesCents,
    totalIncomingCents: result.incomingCents,
    totalOutgoingCents: result.outgoingCents,
  };
}
