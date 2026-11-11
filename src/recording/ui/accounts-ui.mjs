import { accountLedger } from '../core/account-ledger.mjs';
import { ACCOUNT_KINDS } from '../core/accounts.mjs';
import { investmentSummary } from '../behaviors/investment.mjs';
import { cardSummary } from '../behaviors/credit-card.mjs';
import {
  $,
  esc,
  money,
  newId,
  localToday,
  kindLabel,
  accountLabel,
  accountOptions,
  bindAccountPickers,
  field,
  selectField,
  noteField,
  dateCell,
  actionButton,
  showForm,
  confirmAction,
  tableHTML,
  bindPager,
} from './shared-controls.mjs';

export function createAccountsUI(ctx) {
  const root = $('balances-content'),
    monthPage = { page: 1 },
    dayPage = { page: 1 };
  let previousAccount = '',
    from = '',
    through = '',
    lastLedger = null;
  const ledger = () => ctx.getDocument().ledger;
  function activateTab(name) {
    for (const key of ['balances', 'transfers', 'statements']) {
      const active = key === name;
      $(`account-tab-${key}`).setAttribute('aria-selected', String(active));
      $(`account-tab-${key}`).tabIndex = active ? 0 : -1;
      $(`account-${key}-panel`).hidden = !active;
    }
  }
  const tabs = ['balances', 'transfers', 'statements'];
  for (const name of tabs) {
    const button = $(`account-tab-${name}`);
    button.addEventListener('click', () => activateTab(name));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const at = tabs.indexOf(name);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? 2
            : (at + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      activateTab(tabs[next]);
      $(`account-tab-${tabs[next]}`).focus();
    });
  }
  function showAccount(id = null) {
    const existing = ledger().accounts.find((a) => a.id === id);
    showForm({
      title: existing ? 'Edit account' : 'Add account',
      content: `${field('Account name', 'name', existing?.name ?? '', { required: true, attrs: 'maxlength="80"' })}<div class="form-grid">${selectField('Account type', 'kind', ACCOUNT_KINDS.map((k) => `<option value="${k}"${k === (existing?.kind ?? 'checking') ? ' selected' : ''}>${kindLabel(k)}</option>`).join(''))}${field('Opening date', 'openedDate', existing?.openedDate ?? localToday(), { type: 'date', required: true })}</div>${field('Institution', 'institution', existing?.institution ?? '', { attrs: 'maxlength="120"' })}${field('Account endings / aliases', 'aliases', (existing?.aliases ?? []).join(', '), { hint: 'Optional. Separate multiple identifiers with commas.', attrs: 'maxlength="300"' })}${noteField(existing?.note ?? '')}<label class="date-unconfirmed"><input type="checkbox" name="closed"${existing?.closed ? ' checked' : ''}>Account is closed</label><p class="cash-dialog-help">Accounts start at zero. Record the transactions that explain their balance.</p>`,
      submitLabel: existing ? 'Save changes' : 'Add account',
      onSave: (form, dialog) => {
        const value = {
          ...existing,
          id: existing?.id ?? newId('account'),
          name: form.elements.name.value.trim(),
          kind: form.elements.kind.value,
          openedDate: form.elements.openedDate.value,
          institution: form.elements.institution.value.trim(),
          aliases: form.elements.aliases.value
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          note: form.elements.note.value.trim(),
          closed: form.elements.closed.checked,
          updatedAt: undefined,
        };
        ctx.command({ type: 'account.save', value });
        ctx.selectAccount(value.id);
        dialog.close();
      },
    });
  }
  function showPeriod(row) {
    const l = ledger(),
      account = l.accounts.find((a) => a.id === ctx.accountId);
    const entries = l.entries
      .filter((e) => (row.entryIds ?? []).includes(e.id))
      .sort((a, b) => b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id));
    const ownPosting = (transfer) =>
      transfer.sourceAccountId === ctx.accountId
        ? transfer.sourcePostedDate
        : transfer.targetPostedDate;
    const transfers = l.transfers
      .filter((t) => (row.transferIds ?? []).includes(t.id))
      .sort((a, b) => ownPosting(b).localeCompare(ownPosting(a)) || a.id.localeCompare(b.id));
    const category = (entry) =>
      l.categories.find((item) => item.id === entry.categoryId)?.label ?? '';
    const transferAccount = (id, date, unconfirmed) => {
      const label = esc(accountLabel(l.accounts.find((item) => item.id === id)));
      return `${id === ctx.accountId ? `<strong>${label}</strong>` : label}<small class="posted-date">Posted ${esc(date)}${unconfirmed ? '<span class="uncertain" title="Posting date unconfirmed">?</span>' : ''}</small>`;
    };
    const content = `<div class="recording-detail-meta"><strong>${esc(accountLabel(account))}</strong><span>${esc(row.startDate ?? row.date)} – ${esc(row.endDate ?? row.date)}</span><p>Account changes follow posting dates. Newest entries are shown first.</p></div><dl class="recording-detail-summary">${[
      ['Opening balance', row.openingBalanceCents],
      ['Net change', BigInt(row.closingBalanceCents) - BigInt(row.openingBalanceCents)],
      ['Closing balance', row.closingBalanceCents],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${money(value)}</dd></div>`)
      .join(
        '',
      )}</dl><section class="recording-detail-section"><div class="recording-table-heading"><h3>Gains &amp; expenses</h3><span class="scope-note">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</span></div>${entries.length ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="Posted entries" tabindex="0"><table><thead><tr><th scope="col">Activity date</th><th scope="col">Type / category</th><th scope="col">Merchant / note</th><th scope="col" class="amount">Account change</th><th scope="col" class="table-align-end">Actions</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${dateCell(e)}</td><td><span class="type-badge ${e.kind}">${e.kind === 'gain' ? 'Gain' : 'Expense'}</span><small class="posted-date">${esc(category(e))}</small></td><td>${e.merchant ? `<strong>${esc(e.merchant)}</strong>` : '<span class="recording-muted">—</span>'}${e.note ? `<span class="recording-detail-cell-note">${esc(e.note)}</span>` : ''}</td><td class="amount ${e.kind === 'gain' ? 'positive' : 'negative'}">${money(BigInt(e.amountCents) * (e.kind === 'gain' ? 1n : -1n))}</td><td><div class="recording-actions">${actionButton('Edit entry', `data-open-entry="${esc(e.id)}"`, 'edit')}</div></td></tr>`).join('')}</tbody></table></div></div>` : '<p class="recording-note">No gains or expenses posted in this period.</p>'}</section><section class="recording-detail-section"><div class="recording-table-heading"><h3>Transfers</h3><span class="scope-note">${transfers.length} ${transfers.length === 1 ? 'transfer' : 'transfers'}</span></div>${
      transfers.length
        ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="Posted transfers" tabindex="0"><table><thead><tr><th scope="col">Activity date</th><th scope="col">From / source posting</th><th scope="col">To / destination posting</th><th scope="col">Note</th><th scope="col" class="amount">Account change</th></tr></thead><tbody>${transfers
            .map((t) => {
              const outgoing = t.sourceAccountId === ctx.accountId;
              return `<tr><td>${t.activityDate ? `${esc(t.activityDate)}${t.activityDateUnconfirmed ? '<span class="uncertain" title="Activity date unconfirmed">?</span>' : ''}` : '<span class="recording-muted">—</span>'}</td><td>${transferAccount(t.sourceAccountId, t.sourcePostedDate, t.sourcePostedDateUnconfirmed)}</td><td>${transferAccount(t.targetAccountId, t.targetPostedDate, t.targetPostedDateUnconfirmed)}</td><td>${esc(t.note) || '<span class="recording-muted">—</span>'}</td><td class="amount ${outgoing ? 'negative' : 'positive'}">${money(BigInt(t.amountCents) * (outgoing ? -1n : 1n))}<small class="posted-date">${outgoing ? 'Outgoing' : 'Incoming'}</small></td></tr>`;
            })
            .join('')}</tbody></table></div></div>`
        : '<p class="recording-note">No transfers posted in this period.</p>'
    }</section>`;
    const { dialog, form } = showForm({
      title: 'Posted account activity',
      wide: true,
      content,
      submitLabel: 'Done',
      onSave: (_f, d) => d.close(),
    });
    dialog.classList.add('recording-detail-dialog');
    form.addEventListener('click', (event) => {
      const id = event.target.closest('[data-open-entry]')?.dataset.openEntry;
      if (id) {
        dialog.close();
        ctx.showEntry?.(id);
      }
    });
  }
  function render() {
    lastLedger = null;
    const l = ledger();
    if (!l.accounts.some((a) => a.id === ctx.accountId)) ctx.accountId = l.accounts[0]?.id ?? '';
    if (previousAccount !== ctx.accountId) {
      previousAccount = ctx.accountId;
      from = '';
      through = '';
      monthPage.page = dayPage.page = 1;
    }
    const account = l.accounts.find((a) => a.id === ctx.accountId);
    let summary = null,
      error = '';
    if (account) {
      try {
        lastLedger = accountLedger(l, account.id, { from, through });
        summary =
          account.kind === 'investment'
            ? investmentSummary(l, account.id, { from, through })
            : account.kind === 'credit_card'
              ? cardSummary(l, account.id, { from, through })
              : lastLedger;
      } catch (failure) {
        error = failure.message;
        lastLedger = null;
      }
    }
    const cards =
      account?.kind === 'investment' && summary
        ? [
            ['Cash balance', summary.cashBalanceCents],
            ['Holdings at cost', summary.holdingsCostCents],
            ['Recorded total', summary.bookBalanceCents],
          ]
        : account?.kind === 'credit_card' && summary
          ? [
              ['Debt owed', summary.debtCents],
              ['Credit balance', summary.creditCents],
              ['Signed book balance', summary.signedBalanceCents ?? summary.bookBalanceCents],
            ]
          : lastLedger
            ? [
                ['Opening in range', lastLedger.openingBalanceCents],
                [
                  'Net posted in range',
                  BigInt(lastLedger.closingBalanceCents) - BigInt(lastLedger.openingBalanceCents),
                ],
                ['Closing balance', lastLedger.closingBalanceCents],
              ]
            : [];
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">ACCOUNTS &amp; ASSETS</p><h1>Account balances</h1><p class="lead">Follow recorded entries and transfers for your accounts.</p></div><button id="cash-add-account" class="button button-primary" type="button">＋ Add account</button></div><div class="recording-toolbar"><label class="search-grow">Account<select id="cash-account-select">${accountOptions(
      l.accounts,
      ctx.accountId,
      'Choose an account',
    )}</select></label><label>From<input id="cash-start-date" type="date" value="${esc(from)}"></label><label>Through<input id="cash-end-date" type="date" value="${esc(through)}"></label><button id="cash-range-reset" class="button button-outline" type="button">Full account history</button><button id="cash-edit-account" class="button button-quiet" type="button"${account ? '' : ' disabled'}>Edit account</button><button id="cash-delete-account" class="button button-quiet recording-danger" type="button"${account ? '' : ' disabled'}>Delete account</button></div>${account ? `<p class="recording-note">${esc(kindLabel(account.kind))}${account.aliases?.length ? ` · ${esc(account.aliases.join(' / '))}` : ''}${account.closed ? ' · <strong>Closed</strong>' : ''}${account.note ? ` · ${esc(account.note)}` : ''}</p>` : ''}${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}${cards.length ? `<div class="summary-grid">${cards.map(([label, value]) => `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value">${money(value)}</strong><span class="stat-caption">Recorded at the selected posting cutoff</span></div>`).join('')}</div>` : ''}<div id="investments-content"></div>${!account ? '<div class="recording-empty"><h2>Add your first account</h2><p>Start at zero and record the activity that explains your funds and debt.</p></div>' : ''}${lastLedger ? balanceTables(lastLedger) : ''}`;
    bindAccountPickers(root);
    if (lastLedger) {
      const months = lastLedger.months.slice().reverse(),
        days = balanceChangeDays(lastLedger);
      bindPager(root, 'monthly-balances', months.length, monthPage, 12, ctx.render);
      bindPager(root, 'daily-balances', days.length, dayPage, 20, ctx.render);
    }
  }
  function balanceChangeDays(result) {
    return result.days
      .filter((day) => day.closingBalanceCents !== day.openingBalanceCents)
      .reverse();
  }
  function balanceTables(result) {
    const table = (key, title, rows, state, size) =>
      `<section class="recording-section"><div class="recording-table-heading"><h2>${title}</h2><span class="scope-note">${key === 'daily-balances' ? 'Balance changes only · posting dates' : 'Newest periods first · posting dates'}</span></div>${tableHTML(key, [key === 'daily-balances' ? 'Date' : 'Period', { label: 'Opening', align: 'end' }, { label: 'Gains', align: 'end' }, { label: 'Expenses', align: 'end' }, { label: 'Transfers in', align: 'end' }, { label: 'Transfers out', align: 'end' }, { label: 'Closing', align: 'end' }, { label: 'Activity', align: 'end' }], rows, (row) => `<tr><td><button type="button" class="recording-link" data-period="${esc(key === 'monthly-balances' ? row.period : row.date)}" data-period-type="${key}">${esc(key === 'monthly-balances' ? row.period : row.date)}</button></td><td class="amount">${money(row.openingBalanceCents)}</td><td class="amount positive">${money(row.gainsCents)}</td><td class="amount negative">${money(row.expensesCents)}</td><td class="amount">${money(row.incomingCents)}</td><td class="amount">${money(row.outgoingCents)}</td><td class="amount">${money(row.closingBalanceCents)}</td><td class="numeric">${row.activityCount ?? (row.entryIds?.length ?? 0) + (row.transferIds?.length ?? 0)}</td></tr>`, state, size, key === 'daily-balances' ? 'No balance changes in this period.' : 'No records to display.')}</section>`;
    return (
      table(
        'monthly-balances',
        'Monthly balances',
        result.months.slice().reverse(),
        monthPage,
        12,
      ) + table('daily-balances', 'Daily balances', balanceChangeDays(result), dayPage, 20)
    );
  }
  root.addEventListener('change', (event) => {
    if (event.target.id === 'cash-account-select') {
      ctx.selectAccount(event.target.value);
      return;
    }
    if (event.target.id === 'cash-start-date') {
      from = event.target.value;
      monthPage.page = dayPage.page = 1;
      ctx.render();
    }
    if (event.target.id === 'cash-end-date') {
      through = event.target.value;
      monthPage.page = dayPage.page = 1;
      ctx.render();
    }
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.id === 'cash-add-account') showAccount();
      if (button.id === 'cash-edit-account') showAccount(ctx.accountId);
      if (button.id === 'cash-delete-account')
        confirmAction(
          'Delete account?',
          'The account can only be deleted when no records, transfers, holdings, or statements refer to it.',
          () => ctx.command({ type: 'account.delete', id: ctx.accountId }),
          'Delete account',
        );
      if (button.id === 'cash-range-reset') {
        from = through = '';
        monthPage.page = dayPage.page = 1;
        ctx.render();
      }
      if (button.dataset.period) {
        const rows =
          button.dataset.periodType === 'monthly-balances' ? lastLedger.months : lastLedger.days;
        const row = rows.find(
          (r) =>
            (button.dataset.periodType === 'monthly-balances' ? r.period : r.date) ===
            button.dataset.period,
        );
        if (row) showPeriod(row);
      }
    } catch (error) {
      ctx.notify(error.message, true);
    }
  });
  return {
    render,
    showAccount,
    activateTab,
    reset: () => {
      lastLedger = null;
      previousAccount = '';
      from = through = '';
      monthPage.page = dayPage.page = 1;
      activateTab('balances');
    },
    getRange: () => ({ from, through }),
  };
}
