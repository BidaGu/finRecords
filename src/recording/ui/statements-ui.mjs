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
      title: existing ? 'Edit statement' : 'Add statement',
      wide: true,
      content: `<p class="cash-dialog-help">Group existing card expenses and compare the reported balances with recorded activity. This form creates no purchases or payments.</p>${selectField(
        'Credit card account',
        'accountId',
        accountOptions(
          cards,
          existing?.accountId ??
            (cards.some((a) => a.id === ctx.accountId) ? ctx.accountId : cards[0]?.id),
        ),
      )}<div class="form-grid">${field('Period start', 'periodStart', existing?.periodStart ?? `${localToday().slice(0, 7)}-01`, { type: 'date', required: true })}${field('Period end', 'periodEnd', existing?.periodEnd ?? localToday(), { type: 'date', required: true })}</div><div class="form-grid">${moneyField('Opening debt / credit ($)', 'opening', amount(existing?.openingBalanceCents ?? 0), { required: true })}${moneyField('Closing debt / credit ($)', 'closing', existing ? amount(existing.closingBalanceCents) : '', { required: true })}</div><p class="cash-dialog-help">Positive values mean debt; negative values mean a card credit balance.</p><fieldset class="statement-selection"><legend>Statement expenses</legend><p class="cash-dialog-help">Posting dates identify this cycle. Every expense posted in this cycle must be selected.</p><div class="recording-check-list" data-statement-expenses></div><p class="recording-note" data-statement-total></p></fieldset>${field('Source document', 'sourceDocument', existing?.sourceDocument ?? '', { optional: true, attrs: 'maxlength="500"' })}${noteField(existing?.note ?? '')}`,
      submitLabel: 'Save statement',
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
              `<label><input type="checkbox" data-expense-id="${esc(e.id)}"${selected.has(e.id) ? ' checked' : ''}><span class="recording-choice-dates">${dateCell(e)}</span><span class="recording-choice-copy"><strong>${esc(e.merchant || 'Expense')}</strong><small>${esc(l.categories.find((item) => item.id === e.categoryId)?.label ?? '')}</small>${e.note ? `<span>${esc(e.note)}</span>` : ''}</span><strong class="recording-choice-amount">${money(e.amountCents)}</strong></label>`,
          )
          .join('') || '<p class="recording-note">No expenses posted in this cycle.</p>';
      updateTotal();
    }
    function updateTotal() {
      const ids = new Set(
        [...form.querySelectorAll('[data-expense-id]:checked')].map((e) => e.dataset.expenseId),
      );
      const total = ledger()
        .entries.filter((e) => ids.has(e.id))
        .reduce((sum, e) => sum + BigInt(e.amountCents), 0n);
      form.querySelector('[data-statement-total]').textContent =
        `${ids.size} selected expenses · ${money(total)}`;
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
      title: 'Statement details',
      wide: true,
      content: `<div class="recording-detail-meta"><strong>${esc(accountLabel(l.accounts.find((a) => a.id === s.accountId)))}</strong><span>${esc(s.periodStart)} – ${esc(s.periodEnd)}</span><p>Statement balances are positive for debt owed and negative for a card credit.</p></div><dl class="recording-detail-summary">${[
        ['Opening debt / credit', s.openingBalanceCents],
        ['Linked charges', total],
        ['Closing debt / credit', s.closingBalanceCents],
      ]
        .map(([label, value]) => `<div><dt>${label}</dt><dd>${money(value)}</dd></div>`)
        .join(
          '',
        )}</dl><section class="recording-detail-section"><div class="recording-table-heading"><h3>Statement expenses</h3><span class="scope-note">${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} · posting dates identify the cycle</span></div>${expenses.length ? `<div class="recording-detail-table"><div class="table-scroll" role="region" aria-label="Statement expenses" tabindex="0"><table><thead><tr><th scope="col">Activity date</th><th scope="col">Category</th><th scope="col">Merchant / note</th><th scope="col" class="amount">Amount</th><th scope="col" class="table-align-end">Actions</th></tr></thead><tbody>${expenses.map((e) => `<tr><td>${dateCell(e)}</td><td>${esc(l.categories.find((item) => item.id === e.categoryId)?.label ?? '')}</td><td>${e.merchant ? `<strong>${esc(e.merchant)}</strong>` : '<span class="recording-muted">—</span>'}${e.note ? `<span class="recording-detail-cell-note">${esc(e.note)}</span>` : ''}</td><td class="amount">${money(e.amountCents)}</td><td><div class="recording-actions">${actionButton('Edit entry', `data-statement-entry="${esc(e.id)}"`, 'edit')}</div></td></tr>`).join('')}</tbody></table></div></div>` : '<p class="recording-note">No expenses in this statement.</p>'}</section>${s.sourceDocument || s.note ? `<dl class="recording-detail-note">${s.sourceDocument ? `<div><dt>Source document</dt><dd>${esc(s.sourceDocument)}</dd></div>` : ''}${s.note ? `<div><dt>Note</dt><dd>${esc(s.note)}</dd></div>` : ''}</dl>` : ''}<div class="recording-detail-actions"><button type="button" class="button button-outline" data-detail-edit>Edit statement</button><button type="button" class="button button-quiet recording-danger" data-detail-remove>Remove statement</button></div>`,
      submitLabel: 'Done',
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
      'Remove statement?',
      'Remove this statement metadata and its expense links? Entries, transfers, and account balances remain unchanged.',
      () => {
        ctx.command({ type: 'statement.delete', id });
        detailDialog?.close();
      },
      'Remove statement',
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
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">CARD RECORDS</p><h1>Statements</h1><p class="lead">Review statement cycles, expenses, and reported balances.</p></div><button id="statement-add" class="button button-primary" type="button"${cards.length ? '' : ' disabled'}>＋ Add statement</button></div><div class="recording-toolbar"><label>Credit card account<select id="statement-account-filter">${accountOptions(cards, accountId, 'All cards')}</select></label></div>${tableHTML(
      'statements',
      [
        'Cycle',
        'Account',
        { label: 'Opening debt / credit', align: 'end' },
        { label: 'Charges', align: 'end' },
        { label: 'Closing debt / credit', align: 'end' },
        { label: 'Expenses', align: 'end' },
        { label: 'Actions', align: 'end' },
      ],
      items,
      (s) => {
        const expenses = l.entries.filter((e) => s.expenseEntryIds.includes(e.id));
        return `<tr><td>${esc(s.periodStart)}<br>${esc(s.periodEnd)}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === s.accountId)))}</td><td class="amount">${money(s.openingBalanceCents)}</td><td class="amount">${money(expenses.reduce((sum, e) => sum + BigInt(e.amountCents), 0n))}</td><td class="amount">${money(s.closingBalanceCents)}</td><td class="numeric">${expenses.length}</td><td><div class="recording-actions">${actionButton('Details', `data-statement-detail="${esc(s.id)}"`, 'details')}${actionButton('Edit', `data-statement-edit="${esc(s.id)}"`, 'edit')}${actionButton('Remove', `data-statement-delete="${esc(s.id)}"`, 'delete')}</div></td></tr>`;
      },
      page,
      20,
      'No statements recorded for this view.',
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
