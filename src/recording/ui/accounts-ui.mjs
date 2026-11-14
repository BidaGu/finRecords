import { createUIHelpers } from './shared-controls.mjs';
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
  const {
    t: tr,
    error: localizeError,
    compareNames,
    unit,
    currencyLabel,
    money,
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
  } = createUIHelpers(ctx);
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
      title: existing
        ? tr('financial.edit_account_101882', 'Edit account')
        : tr('financial.add_account_98b0ed', 'Add account'),
      content: `${field(tr('financial.account_name_abe4d6', 'Account name'), 'name', existing?.name ?? '', { required: true, attrs: 'maxlength="80"' })}<div class="form-grid">${selectField(tr('financial.account_type_144b49', 'Account type'), 'kind', ACCOUNT_KINDS.map((k) => `<option value="${k}"${k === (existing?.kind ?? 'checking') ? ' selected' : ''}>${kindLabel(k)}</option>`).join(''))}${field(tr('financial.opening_date_a08c44', 'Opening date'), 'openedDate', existing?.openedDate ?? localToday(), { type: 'date', required: true })}</div>${field(tr('financial.institution_429f94', 'Institution'), 'institution', existing?.institution ?? '', { attrs: 'maxlength="120"' })}${field(tr('financial.account_endings_aliases_cafba0', 'Account endings / aliases'), 'aliases', (existing?.aliases ?? []).join(', '), { hint: tr('financial.optional_separate_multiple_identifiers_with_commas_fd9126', 'Optional. Separate multiple identifiers with commas.'), attrs: 'maxlength="300"' })}${noteField(existing?.note ?? '')}<label class="date-unconfirmed"><input type="checkbox" name="closed"${existing?.closed ? ' checked' : ''}>${esc(tr('financial.account_is_closed_017214', 'Account is closed'))}</label><p class="cash-dialog-help">${esc(tr('financial.accounts_start_at_zero_record_the_transactions_that_explai_a20b93', 'Accounts start at zero. Record the transactions that explain their balance.'))}</p>`,
      submitLabel: existing
        ? tr('financial.save_changes_179359', 'Save changes')
        : tr('financial.add_account_98b0ed', 'Add account'),
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
      return `${id === ctx.accountId ? `<strong>${label}</strong>` : label}<small class="posted-date">${esc(tr('financial.posted_301777', 'Posted'))} ${esc(date)}${unconfirmed ? `<span class="uncertain" title="${esc(tr('financial.posting_date_unconfirmed_4ab5a7', 'Posting date unconfirmed'))}">?</span>` : ''}</small>`;
    };
    const content = `<div class="recording-detail-meta"><strong>${esc(accountLabel(account))}</strong><span>${esc(row.startDate ?? row.date)} – ${esc(row.endDate ?? row.date)}</span><p>${esc(tr('financial.account_changes_follow_posting_dates_newest_entries_are_sh_ccd769', 'Account changes follow posting dates. Newest entries are shown first.'))}</p></div><dl class="recording-detail-summary">${[
      [tr('financial.opening_balance_7622a7', 'Opening balance'), row.openingBalanceCents],
      [
        tr('financial.net_change_1818c9', 'Net change'),
        BigInt(row.closingBalanceCents) - BigInt(row.openingBalanceCents),
      ],
      [tr('financial.closing_balance_c171f5', 'Closing balance'), row.closingBalanceCents],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${esc(currencyLabel(label))}</dt><dd>${money(value)}</dd></div>`,
      )
      .join(
        '',
      )}</dl><section class="recording-detail-section"><div class="recording-table-heading"><h3>${esc(tr('financial.gains_expenses_fc1031', 'Gains & expenses'))}</h3><span class="scope-note">${entries.length} ${entries.length === 1 ? tr('financial.entry_61c412', 'entry') : tr('financial.entries_c2e311', 'entries')}</span></div>${entries.length ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="${esc(tr('financial.posted_entries_a0bcb5', 'Posted entries'))}" tabindex="0"><table><thead><tr><th scope="col">${esc(tr('financial.activity_date_14bd67', 'Activity date'))}</th><th scope="col">${esc(tr('financial.type_category_50095d', 'Type / category'))}</th><th scope="col">${esc(tr('financial.merchant_note_e7d87a', 'Merchant / note'))}</th><th scope="col" class="amount">${esc(currencyLabel(tr('financial.account_change_b99951', 'Account change')))}</th><th scope="col" class="table-align-end">${esc(tr('financial.actions_c3cd63', 'Actions'))}</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${dateCell(e)}</td><td><span class="type-badge ${e.kind}">${e.kind === 'gain' ? tr('financial.gain_96dd91', 'Gain') : tr('financial.expense_a0db8e', 'Expense')}</span><small class="posted-date">${esc(category(e))}</small></td><td>${e.merchant ? `<strong>${esc(e.merchant)}</strong>` : '<span class="recording-muted">—</span>'}${e.note ? `<span class="recording-detail-cell-note">${esc(e.note)}</span>` : ''}</td><td class="amount ${e.kind === 'gain' ? 'positive' : 'negative'}">${money(BigInt(e.amountCents) * (e.kind === 'gain' ? 1n : -1n))}</td><td><div class="recording-actions">${actionButton(tr('financial.edit_entry_65440f', 'Edit entry'), `data-open-entry="${esc(e.id)}"`, 'edit')}</div></td></tr>`).join('')}</tbody></table></div></div>` : `<p class="recording-note">${esc(tr('financial.no_gains_or_expenses_posted_in_this_period_539e9e', 'No gains or expenses posted in this period.'))}</p>`}</section><section class="recording-detail-section"><div class="recording-table-heading"><h3>${esc(tr('financial.transfers_812412', 'Transfers'))}</h3><span class="scope-note">${transfers.length} ${transfers.length === 1 ? tr('financial.transfer_34420c', 'transfer') : tr('financial.transfers_f060b6', 'transfers')}</span></div>${
      transfers.length
        ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="${esc(tr('financial.posted_transfers_54cf43', 'Posted transfers'))}" tabindex="0"><table><thead><tr><th scope="col">${esc(tr('financial.activity_date_14bd67', 'Activity date'))}</th><th scope="col">${esc(tr('financial.from_source_posting_415250', 'From / source posting'))}</th><th scope="col">${esc(tr('financial.to_destination_posting_96060b', 'To / destination posting'))}</th><th scope="col">${esc(tr('financial.note_2c924e', 'Note'))}</th><th scope="col" class="amount">${esc(currencyLabel(tr('financial.account_change_b99951', 'Account change')))}</th></tr></thead><tbody>${transfers
            .map((t) => {
              const outgoing = t.sourceAccountId === ctx.accountId;
              return `<tr><td>${t.activityDate ? `${esc(t.activityDate)}${t.activityDateUnconfirmed ? `<span class="uncertain" title="${esc(tr('financial.activity_date_unconfirmed_c87845', 'Activity date unconfirmed'))}">?</span>` : ''}` : '<span class="recording-muted">—</span>'}</td><td>${transferAccount(t.sourceAccountId, t.sourcePostedDate, t.sourcePostedDateUnconfirmed)}</td><td>${transferAccount(t.targetAccountId, t.targetPostedDate, t.targetPostedDateUnconfirmed)}</td><td>${esc(t.note) || '<span class="recording-muted">—</span>'}</td><td class="amount ${outgoing ? 'negative' : 'positive'}">${money(BigInt(t.amountCents) * (outgoing ? -1n : 1n))}<small class="posted-date">${outgoing ? tr('financial.outgoing_bd2d91', 'Outgoing') : tr('financial.incoming_a9c615', 'Incoming')}</small></td></tr>`;
            })
            .join('')}</tbody></table></div></div>`
        : `<p class="recording-note">${esc(tr('financial.no_transfers_posted_in_this_period_5e2106', 'No transfers posted in this period.'))}</p>`
    }</section>`;
    const { dialog, form } = showForm({
      title: tr('financial.posted_account_activity_78e4d5', 'Posted account activity'),
      wide: true,
      content,
      submitLabel: tr('financial.done_e9b450', 'Done'),
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
        error = localizeError(failure);
        lastLedger = null;
      }
    }
    const cards =
      account?.kind === 'investment' && summary
        ? [
            [tr('financial.cash_balance_d88b90', 'Cash balance'), summary.cashBalanceCents],
            [
              tr('financial.holdings_at_cost_42323d', 'Holdings at cost'),
              summary.holdingsCostCents,
            ],
            [tr('financial.recorded_total_bd711b', 'Recorded total'), summary.bookBalanceCents],
          ]
        : account?.kind === 'credit_card' && summary
          ? [
              [tr('financial.debt_owed_14d66b', 'Debt owed'), summary.debtCents],
              [tr('financial.credit_balance_471f02', 'Credit balance'), summary.creditCents],
              [
                tr('financial.signed_book_balance_df0356', 'Signed book balance'),
                summary.signedBalanceCents ?? summary.bookBalanceCents,
              ],
            ]
          : lastLedger
            ? [
                [
                  tr('financial.opening_in_range_209496', 'Opening in range'),
                  lastLedger.openingBalanceCents,
                ],
                [
                  tr('financial.net_posted_in_range_39ce88', 'Net posted in range'),
                  BigInt(lastLedger.closingBalanceCents) - BigInt(lastLedger.openingBalanceCents),
                ],
                [
                  tr('financial.closing_balance_c171f5', 'Closing balance'),
                  lastLedger.closingBalanceCents,
                ],
              ]
            : [];
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">${esc(tr('financial.accounts_assets_669fab', 'ACCOUNTS & ASSETS'))}</p><h1>${esc(tr('financial.account_balances_2d7b8e', 'Account balances'))}</h1><p class="lead">${esc(tr('financial.follow_recorded_entries_and_transfers_for_your_accounts_b7a6ff', 'Follow recorded entries and transfers for your accounts.'))}</p></div><button id="cash-add-account" class="button button-primary" type="button">${esc(tr('financial.add_account_eda76f', '＋ Add account'))}</button></div><div class="recording-toolbar"><label class="search-grow">${esc(tr('financial.account_85dfa3', 'Account'))}<select id="cash-account-select">${accountOptions(
      l.accounts,
      ctx.accountId,
      tr('financial.choose_an_account_dc4922', 'Choose an account'),
    )}</select></label><label>${esc(tr('financial.from_3f6605', 'From'))}<input id="cash-start-date" type="date" value="${esc(from)}"></label><label>${esc(tr('financial.through_553658', 'Through'))}<input id="cash-end-date" type="date" value="${esc(through)}"></label><button id="cash-range-reset" class="button button-outline" type="button">${esc(tr('financial.full_account_history_2307d6', 'Full account history'))}</button><button id="cash-edit-account" class="button button-quiet" type="button"${account ? '' : ' disabled'}>${esc(tr('financial.edit_account_101882', 'Edit account'))}</button><button id="cash-delete-account" class="button button-quiet recording-danger" type="button"${account ? '' : ' disabled'}>${esc(tr('financial.delete_account_1753c2', 'Delete account'))}</button></div>${account ? `<p class="recording-note">${esc(kindLabel(account.kind))}${account.aliases?.length ? ` · ${esc(account.aliases.join(' / '))}` : ''}${account.closed ? ` · <strong>${esc(tr('financial.closed_88d86b', 'Closed'))}</strong>` : ''}${account.note ? ` · ${esc(account.note)}` : ''}</p>` : ''}${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}${cards.length ? `<div class="summary-grid">${cards.map(([label, value]) => `<div class="summary-stat"><span class="stat-label">${esc(currencyLabel(label))}</span><strong class="stat-value">${money(value)}</strong><span class="stat-caption">${esc(tr('financial.recorded_at_the_selected_posting_cutoff_a23c3d', 'Recorded at the selected posting cutoff'))}</span></div>`).join('')}</div>` : ''}<div id="investments-content"></div>${!account ? `<div class="recording-empty"><h2>${esc(tr('financial.add_your_first_account_20122c', 'Add your first account'))}</h2><p>${esc(tr('financial.start_at_zero_and_record_the_activity_that_explains_your_f_c28bda', 'Start at zero and record the activity that explains your funds and debt.'))}</p></div>` : ''}${lastLedger ? balanceTables(lastLedger) : ''}`;
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
      `<section class="recording-section"><div class="recording-table-heading"><h2>${title}</h2><span class="scope-note">${key === 'daily-balances' ? tr('financial.balance_changes_only_posting_dates_9602f4', 'Balance changes only · posting dates') : tr('financial.newest_periods_first_posting_dates_6498ad', 'Newest periods first · posting dates')}</span></div>${tableHTML(key, [key === 'daily-balances' ? tr('ui.date', 'Date') : tr('financial.period_170a28', 'Period'), { label: tr('financial.opening_56e440', 'Opening'), align: 'end', monetary: true }, { label: tr('financial.gains_328c1c', 'Gains'), align: 'end', monetary: true }, { label: tr('financial.expenses_8d437d', 'Expenses'), align: 'end', monetary: true }, { label: tr('financial.transfers_in_956656', 'Transfers in'), align: 'end', monetary: true }, { label: tr('financial.transfers_out_1d119a', 'Transfers out'), align: 'end', monetary: true }, { label: tr('financial.closing_76a032', 'Closing'), align: 'end', monetary: true }, { label: tr('financial.activity_81c0d9', 'Activity'), align: 'end' }], rows, (row) => `<tr><td><button type="button" class="recording-link" data-period="${esc(key === 'monthly-balances' ? row.period : row.date)}" data-period-type="${key}">${esc(key === 'monthly-balances' ? row.period : row.date)}</button></td><td class="amount">${money(row.openingBalanceCents)}</td><td class="amount positive">${money(row.gainsCents)}</td><td class="amount negative">${money(row.expensesCents)}</td><td class="amount">${money(row.incomingCents)}</td><td class="amount">${money(row.outgoingCents)}</td><td class="amount">${money(row.closingBalanceCents)}</td><td class="numeric">${row.activityCount ?? (row.entryIds?.length ?? 0) + (row.transferIds?.length ?? 0)}</td></tr>`, state, size, key === 'daily-balances' ? tr('financial.no_balance_changes_in_this_period_824033', 'No balance changes in this period.') : tr('financial.no_records_to_display_94ebd1', 'No records to display.'))}</section>`;
    return (
      table(
        'monthly-balances',
        tr('financial.monthly_balances_1d53e3', 'Monthly balances'),
        result.months.slice().reverse(),
        monthPage,
        12,
      ) +
      table(
        'daily-balances',
        tr('financial.daily_balances_695a33', 'Daily balances'),
        balanceChangeDays(result),
        dayPage,
        20,
      )
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
          tr('financial.delete_account_f58423', 'Delete account?'),
          tr(
            'financial.the_account_can_only_be_deleted_when_no_records_transfers__33242c',
            'The account can only be deleted when no records, transfers, holdings, or statements refer to it.',
          ),
          () => ctx.command({ type: 'account.delete', id: ctx.accountId }),
          tr('financial.delete_account_1753c2', 'Delete account'),
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
      ctx.notify(error, true);
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
