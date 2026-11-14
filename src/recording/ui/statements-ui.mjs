import { createUIHelpers } from './shared-controls.mjs';
import {
  $,
  esc,
  money,
  amount,
  parseMoney,
  newId,
  localToday,
  accountLabel,
  accountOptions,
  bindAccountPickers,
  field,
  moneyField,
  selectField,
  noteField,
  dateCell,
  actionButton,
  showForm,
  confirmAction,
  tableHTML,
  bindPager,
} from './shared-controls.mjs';

export function createStatementsUI(ctx) {
  const {
    t: tr,
    error: localizeError,
    compareNames,
    unit,
    currencyLabel,
    money,
    accountLabel,
    accountOptions,
    bindAccountPickers,
    field,
    moneyField,
    selectField,
    noteField,
    dateCell,
    actionButton,
    showForm,
    confirmAction,
    tableHTML,
    bindPager,
  } = createUIHelpers(ctx);
  const root = $('statements-content'),
    page = { page: 1 };
  let accountId = '';
  const ledger = () => ctx.getDocument().ledger;
  function showStatement(id = null) {
    const l = ledger(),
      existing = l.statements.find((s) => s.id === id),
      cards = l.accounts.filter((a) => a.kind === 'credit_card');
    const selected = new Set(existing?.expenseEntryIds ?? []);
    let previousContext = '';
    const { form, dialog } = showForm({
      title: existing
        ? tr('financial.edit_statement_339e6b', 'Edit statement')
        : tr('financial.add_statement_3ff9c6', 'Add statement'),
      wide: true,
      content: `<p class="cash-dialog-help">${esc(tr('financial.group_existing_card_expenses_and_compare_the_reported_bala_40e37d', 'Group existing card expenses and compare the reported balances with recorded activity. This form creates no purchases or payments.'))}</p>${selectField(
        tr('financial.credit_card_account_830840', 'Credit card account'),
        'accountId',
        accountOptions(
          cards,
          existing?.accountId ??
            (cards.some((a) => a.id === ctx.accountId) ? ctx.accountId : cards[0]?.id),
        ),
      )}<div class="form-grid">${field(tr('financial.period_start_e1f35c', 'Period start'), 'periodStart', existing?.periodStart ?? `${localToday().slice(0, 7)}-01`, { type: 'date', required: true })}${field(tr('financial.period_end_de2f48', 'Period end'), 'periodEnd', existing?.periodEnd ?? localToday(), { type: 'date', required: true })}</div><div class="form-grid">${moneyField(tr('financial.opening_debt_credit_10776e', 'Opening debt / credit ({currency})', { currency: unit() }), 'opening', amount(existing?.openingBalanceCents ?? 0), { required: true })}${moneyField(tr('financial.closing_debt_credit_5b145f', 'Closing debt / credit ({currency})', { currency: unit() }), 'closing', existing ? amount(existing.closingBalanceCents) : '', { required: true })}</div><p class="cash-dialog-help">${esc(tr('financial.positive_values_mean_debt_negative_values_mean_a_card_cred_72b539', 'Positive values mean debt; negative values mean a card credit balance.'))}</p><fieldset class="statement-selection"><legend>${esc(currencyLabel(tr('financial.statement_expenses_72106f', 'Statement expenses')))}</legend><p class="cash-dialog-help">${esc(tr('financial.posting_dates_identify_this_cycle_every_expense_posted_in__99f068', 'Posting dates identify this cycle. Every expense posted in this cycle must be selected.'))}</p><div class="recording-check-list" data-statement-expenses></div><p class="recording-note" data-statement-total></p></fieldset>${field(tr('financial.source_document_e1e251', 'Source document'), 'sourceDocument', existing?.sourceDocument ?? '', { optional: true, attrs: 'maxlength="500"' })}${noteField(existing?.note ?? '')}`,
      submitLabel: tr('financial.save_statement_ad7b2a', 'Save statement'),
      onSave: (f, d) => {
        ctx.command({
          type: 'statement.save',
          value: {
            ...existing,
            id: existing?.id ?? newId('statement'),
            accountId: f.elements.accountId.value,
            periodStart: f.elements.periodStart.value,
            periodEnd: f.elements.periodEnd.value,
            openingBalanceCents: parseMoney(f.elements.opening.value),
            closingBalanceCents: parseMoney(f.elements.closing.value),
            expenseEntryIds: [...f.querySelectorAll('[data-expense-id]:checked')].map(
              (input) => input.dataset.expenseId,
            ),
            sourceDocument: f.elements.sourceDocument.value.trim(),
            note: f.elements.note.value.trim(),
            updatedAt: undefined,
          },
        });
        d.close();
      },
    });
    function refresh() {
      const a = form.elements.accountId.value,
        start = form.elements.periodStart.value,
        end = form.elements.periodEnd.value,
        context = [a, start, end].join('|');
      const entries = ledger()
        .entries.filter(
          (e) =>
            e.kind === 'expense' &&
            e.accountId === a &&
            e.postedDate >= start &&
            e.postedDate <= end,
        )
        .sort((a, b) => a.postedDate.localeCompare(b.postedDate) || a.id.localeCompare(b.id));
      if (!existing && context !== previousContext) {
        selected.clear();
        entries.forEach((e) => selected.add(e.id));
      }
      previousContext = context;
      form.querySelector('[data-statement-expenses]').innerHTML =
        entries
          .map(
            (e) =>
              `<label><input type="checkbox" data-expense-id="${esc(e.id)}"${selected.has(e.id) ? ' checked' : ''}><span class="recording-choice-dates">${dateCell(e)}</span><span class="recording-choice-copy"><strong>${esc(e.merchant || tr('financial.expense_a0db8e', 'Expense'))}</strong><small>${esc(l.categories.find((item) => item.id === e.categoryId)?.label ?? '')}</small>${e.note ? `<span>${esc(e.note)}</span>` : ''}</span><strong class="recording-choice-amount">${money(e.amountCents)}</strong></label>`,
          )
          .join('') ||
        `<p class="recording-note">${esc(tr('financial.no_expenses_posted_in_this_cycle_47a448', 'No expenses posted in this cycle.'))}</p>`;
      updateTotal();
    }
    function updateTotal() {
      const ids = new Set(
        [...form.querySelectorAll('[data-expense-id]:checked')].map((e) => e.dataset.expenseId),
      );
      const total = ledger()
        .entries.filter((e) => ids.has(e.id))
        .reduce((sum, e) => sum + BigInt(e.amountCents), 0n);
      form.querySelector('[data-statement-total]').textContent = tr(
        'financial.money.statementTotal',
        '{count} selected expenses · Total ({currency}): {amount}',
        { count: ids.size, currency: unit(), amount: money(total) },
      );
    }
    form.addEventListener('change', (event) => {
      if (['accountId', 'periodStart', 'periodEnd'].includes(event.target.name)) refresh();
      if (event.target.dataset.expenseId) {
        event.target.checked
          ? selected.add(event.target.dataset.expenseId)
          : selected.delete(event.target.dataset.expenseId);
        updateTotal();
      }
    });
    refresh();
    return dialog;
  }
  function showDetails(id) {
    const l = ledger(),
      s = l.statements.find((s) => s.id === id);
    if (!s) return;
    const expenses = l.entries
      .filter((e) => s.expenseEntryIds.includes(e.id))
      .sort((a, b) => b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id));
    const total = expenses.reduce((sum, e) => sum + BigInt(e.amountCents), 0n);
    const { dialog, form } = showForm({
      title: tr('financial.statement_details_bac372', 'Statement details'),
      wide: true,
      content: `<div class="recording-detail-meta"><strong>${esc(accountLabel(l.accounts.find((a) => a.id === s.accountId)))}</strong><span>${esc(s.periodStart)} – ${esc(s.periodEnd)}</span><p>${esc(tr('financial.statement_balances_are_positive_for_debt_owed_and_negative_f6d9a2', 'Statement balances are positive for debt owed and negative for a card credit.'))}</p></div><dl class="recording-detail-summary">${[
        [
          tr('financial.opening_debt_credit_bbcf81', 'Opening debt / credit'),
          s.openingBalanceCents,
        ],
        [tr('financial.linked_charges_3ee0ba', 'Linked charges'), total],
        [
          tr('financial.closing_debt_credit_3aa665', 'Closing debt / credit'),
          s.closingBalanceCents,
        ],
      ]
        .map(
          ([label, value]) =>
            `<div><dt>${esc(currencyLabel(label))}</dt><dd>${money(value)}</dd></div>`,
        )
        .join(
          '',
        )}</dl><section class="recording-detail-section"><div class="recording-table-heading"><h3>${esc(tr('financial.statement_expenses_72106f', 'Statement expenses'))}</h3><span class="scope-note">${expenses.length} ${expenses.length === 1 ? 'expense' : tr('financial.expenses_94bd7b', 'expenses')} ${esc(tr('financial.posting_dates_identify_the_cycle_0be801', '· posting dates identify the cycle'))}</span></div>${expenses.length ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="${esc(tr('financial.statement_expenses_72106f', 'Statement expenses'))}" tabindex="0"><table><thead><tr><th scope="col">${esc(tr('financial.activity_date_14bd67', 'Activity date'))}</th><th scope="col">${esc(tr('financial.category_a3c686', 'Category'))}</th><th scope="col">${esc(tr('financial.merchant_note_e7d87a', 'Merchant / note'))}</th><th scope="col" class="amount">${esc(currencyLabel(tr('financial.amount_43dc85', 'Amount')))}</th><th scope="col" class="table-align-end">${esc(tr('financial.actions_c3cd63', 'Actions'))}</th></tr></thead><tbody>${expenses.map((e) => `<tr><td>${dateCell(e)}</td><td>${esc(l.categories.find((item) => item.id === e.categoryId)?.label ?? '')}</td><td>${e.merchant ? `<strong>${esc(e.merchant)}</strong>` : '<span class="recording-muted">—</span>'}${e.note ? `<span class="recording-detail-cell-note">${esc(e.note)}</span>` : ''}</td><td class="amount">${money(e.amountCents)}</td><td><div class="recording-actions">${actionButton(tr('financial.edit_entry_65440f', 'Edit entry'), `data-statement-entry="${esc(e.id)}"`, 'edit')}</div></td></tr>`).join('')}</tbody></table></div></div>` : `<p class="recording-note">${esc(tr('financial.no_expenses_in_this_statement_d3351a', 'No expenses in this statement.'))}</p>`}</section>${s.sourceDocument || s.note ? `<dl class="recording-detail-note">${s.sourceDocument ? `<div><dt>${esc(tr('financial.source_document_e1e251', 'Source document'))}</dt><dd>${esc(s.sourceDocument)}</dd></div>` : ''}${s.note ? `<div><dt>${esc(tr('financial.note_2c924e', 'Note'))}</dt><dd>${esc(s.note)}</dd></div>` : ''}</dl>` : ''}<div class="recording-detail-actions"><button type="button" class="button button-outline" data-detail-edit>${esc(tr('financial.edit_statement_339e6b', 'Edit statement'))}</button><button type="button" class="button button-quiet recording-danger" data-detail-remove>${esc(tr('financial.remove_statement_100039', 'Remove statement'))}</button></div>`,
      submitLabel: tr('financial.done_e9b450', 'Done'),
      onSave: (_f, d) => d.close(),
    });
    dialog.classList.add('recording-detail-dialog');
    form.addEventListener('click', (event) => {
      if (event.target.closest('[data-detail-edit]')) {
        dialog.close();
        showStatement(id);
      }
      if (event.target.closest('[data-detail-remove]')) remove(id, dialog);
      const entry = event.target.closest('[data-statement-entry]')?.dataset.statementEntry;
      if (entry) {
        dialog.close();
        ctx.showEntry?.(entry);
      }
    });
  }
  function remove(id, detailDialog) {
    confirmAction(
      tr('financial.remove_statement_9600d1', 'Remove statement?'),
      tr(
        'financial.remove_this_statement_metadata_and_its_expense_links_entri_c19193',
        'Remove this statement metadata and its expense links? Entries, transfers, and account balances remain unchanged.',
      ),
      () => {
        ctx.command({ type: 'statement.delete', id });
        detailDialog?.close();
      },
      tr('financial.remove_statement_100039', 'Remove statement'),
    );
  }
  function render() {
    const l = ledger(),
      cards = l.accounts.filter((a) => a.kind === 'credit_card');
    if (accountId && !cards.some((a) => a.id === accountId)) accountId = '';
    const items = l.statements
      .filter((s) => !accountId || s.accountId === accountId)
      .slice()
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.id.localeCompare(b.id));
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">${esc(tr('financial.card_records_548859', 'CARD RECORDS'))}</p><h1>${esc(tr('financial.statements_5653ce', 'Statements'))}</h1><p class="lead">${esc(tr('financial.review_statement_cycles_expenses_and_reported_balances_6cd900', 'Review statement cycles, expenses, and reported balances.'))}</p></div><button id="statement-add" class="button button-primary" type="button"${cards.length ? '' : ' disabled'}>${esc(tr('financial.add_statement_242bac', '＋ Add statement'))}</button></div><div class="recording-toolbar"><label>${esc(tr('financial.credit_card_account_830840', 'Credit card account'))}<select id="statement-account-filter">${accountOptions(cards, accountId, tr('financial.all_cards_9598c1', 'All cards'))}</select></label></div>${tableHTML(
      'statements',
      [
        tr('financial.cycle_f5eda1', 'Cycle'),
        tr('financial.account_85dfa3', 'Account'),
        {
          label: tr('financial.opening_debt_credit_bbcf81', 'Opening debt / credit'),
          align: 'end',
          monetary: true,
        },
        { label: tr('financial.charges_cfc370', 'Charges'), align: 'end', monetary: true },
        {
          label: tr('financial.closing_debt_credit_3aa665', 'Closing debt / credit'),
          align: 'end',
          monetary: true,
        },
        { label: tr('financial.expenses_8d437d', 'Expenses'), align: 'end' },
        { label: tr('financial.actions_c3cd63', 'Actions'), align: 'end' },
      ],
      items,
      (s) => {
        const expenses = l.entries.filter((e) => s.expenseEntryIds.includes(e.id));
        return `<tr><td>${esc(s.periodStart)}<br>${esc(s.periodEnd)}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === s.accountId)))}</td><td class="amount">${money(s.openingBalanceCents)}</td><td class="amount">${money(expenses.reduce((sum, e) => sum + BigInt(e.amountCents), 0n))}</td><td class="amount">${money(s.closingBalanceCents)}</td><td class="numeric">${expenses.length}</td><td><div class="recording-actions">${actionButton(tr('financial.details_dc3dec', 'Details'), `data-statement-detail="${esc(s.id)}"`, 'details')}${actionButton(tr('financial.edit_530164', 'Edit'), `data-statement-edit="${esc(s.id)}"`, 'edit')}${actionButton(tr('financial.remove_e96390', 'Remove'), `data-statement-delete="${esc(s.id)}"`, 'delete')}</div></td></tr>`;
      },
      page,
      20,
      tr(
        'financial.no_statements_recorded_for_this_view_36eb16',
        'No statements recorded for this view.',
      ),
    )}`;
    bindPager(root, 'statements', items.length, page, 20, render);
    bindAccountPickers(root);
  }
  root.addEventListener('change', (event) => {
    if (event.target.id === 'statement-account-filter') {
      accountId = event.target.value;
      page.page = 1;
      render();
    }
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'statement-add') showStatement();
    if (button.dataset.statementDetail) showDetails(button.dataset.statementDetail);
    if (button.dataset.statementEdit) showStatement(button.dataset.statementEdit);
    if (button.dataset.statementDelete) remove(button.dataset.statementDelete);
  });
  return {
    render,
    showStatement,
    showDetails,
    reset: () => {
      accountId = '';
      page.page = 1;
    },
  };
}
