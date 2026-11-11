import {
  $,
  esc,
  money,
  actionButton,
  amount,
  parseMoney,
  newId,
  localToday,
  accountLabel,
  accountChoices,
  accountOptions,
  moneyField,
  selectField,
  noteField,
  showForm,
  showSelectionFilter,
  confirmAction,
  tableHTML,
  bindPager,
} from './shared-controls.mjs';

export function createTransfersUI(ctx) {
  const root = $('transfers-content'),
    page = { page: 1 };
  let accounts = null,
    from = '',
    through = '',
    filterDialog = null;
  const ledger = () => ctx.getDocument().ledger;
  function showAccountFilter() {
    filterDialog?.close();
    const { dialog } = showSelectionFilter({
      title: 'Filter accounts',
      description:
        'Choose one or more accounts. Transfers involving any selected account are included. Apply filters when ready.',
      groups: [
        {
          id: 'accounts',
          label: 'Accounts',
          items: accountChoices(ledger().accounts),
          selection: accounts,
        },
      ],
      onApply: (draft) => {
        accounts = draft.get('accounts');
        page.page = 1;
        render();
      },
      onClose: () => {
        if (filterDialog !== dialog) return;
        filterDialog = null;
        $('transfer-account-filter')?.focus();
      },
    });
    filterDialog = dialog;
  }
  function reset() {
    const draft = filterDialog;
    filterDialog = null;
    draft?.close();
    accounts = null;
    from = through = '';
    page.page = 1;
  }
  function showTransfer(id = null) {
    const l = ledger(),
      existing = l.transfers.find((t) => t.id === id),
      value = existing ?? {};
    const accounts = l.accounts;
    const date = (label, name, flag, value) =>
      `<div class="form-field"><label>${label}<input name="${name}" type="date" required value="${esc(value ?? localToday())}"></label><label class="date-unconfirmed"><input type="checkbox" name="${flag}"${existing?.[flag] ? ' checked' : ''}>${label} unconfirmed</label></div>`;
    showForm({
      title: existing ? 'Edit transfer' : 'Add transfer',
      content: `<div class="form-grid">${selectField('From account', 'sourceAccountId', accountOptions(accounts, value.sourceAccountId ?? ctx.accountId))}${selectField('To account', 'targetAccountId', accountOptions(accounts, value.targetAccountId))}</div>${moneyField('Amount ($)', 'amount', existing ? amount(value.amountCents) : '', { required: true, attrs: 'autocomplete="off"' })}<div class="form-grid">${date('Source posting date', 'sourcePostedDate', 'sourcePostedDateUnconfirmed', value.sourcePostedDate)}${date('Destination posting date', 'targetPostedDate', 'targetPostedDateUnconfirmed', value.targetPostedDate)}</div><div class="form-field"><label>Activity date <span>Optional</span><input name="activityDate" type="date" value="${esc(value.activityDate ?? '')}"></label><label class="date-unconfirmed"><input name="activityDateUnconfirmed" type="checkbox"${value.activityDateUnconfirmed ? ' checked' : ''}>Activity date unconfirmed</label><div class="recording-mini-actions"><button class="recording-link" type="button" data-copy-date="sourcePostedDate" data-date-target="activityDate">Use source posting date</button><button class="recording-link" type="button" data-copy-date="targetPostedDate" data-date-target="activityDate">Use destination posting date</button></div></div>${noteField(value.note ?? '')}<p class="cash-dialog-help">One transfer updates both accounts on their own posting dates. It creates no Gain or Expense.</p>`,
      submitLabel: existing ? 'Save changes' : 'Add transfer',
      onSave: (form, dialog) => {
        ctx.command({
          type: 'transfer.save',
          value: {
            ...existing,
            id: existing?.id ?? newId('transfer'),
            sourceAccountId: form.elements.sourceAccountId.value,
            targetAccountId: form.elements.targetAccountId.value,
            amountCents: parseMoney(form.elements.amount.value),
            sourcePostedDate: form.elements.sourcePostedDate.value,
            targetPostedDate: form.elements.targetPostedDate.value,
            sourcePostedDateUnconfirmed: form.elements.sourcePostedDateUnconfirmed.checked,
            targetPostedDateUnconfirmed: form.elements.targetPostedDateUnconfirmed.checked,
            activityDate: form.elements.activityDate.value,
            activityDateUnconfirmed: form.elements.activityDateUnconfirmed.checked,
            note: form.elements.note.value.trim(),
            updatedAt: undefined,
          },
        });
        dialog.close();
      },
    });
  }
  function render() {
    const l = ledger();
    const invalid = from && through && from > through;
    const selected = (id) => accounts === null || accounts.has(id);
    const inRange = (date) => (!from || date >= from) && (!through || date <= through);
    const selectedCount = l.accounts.filter((account) => selected(account.id)).length;
    const accountSummary =
      accounts === null
        ? 'All accounts'
        : selectedCount === 0
          ? 'No accounts'
          : `${selectedCount} of ${l.accounts.length} accounts`;
    const items = invalid
      ? []
      : l.transfers
          .filter(
            (t) =>
              (selected(t.sourceAccountId) && inRange(t.sourcePostedDate)) ||
              (selected(t.targetAccountId) && inRange(t.targetPostedDate)),
          )
          .slice()
          .sort(
            (a, b) =>
              b.targetPostedDate.localeCompare(a.targetPostedDate) || a.id.localeCompare(b.id),
          );
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">BETWEEN YOUR ACCOUNTS</p><h1>Transfer history</h1><p class="lead">Move funds between accounts without adding gains or expenses.</p></div><button id="transfer-add" class="button button-primary" type="button"${l.accounts.length < 2 ? ' disabled' : ''}>＋ Add transfer</button></div><div class="recording-toolbar"><div class="recording-filter-control"><span id="transfer-account-filter-label">Account</span><button id="transfer-account-filter" class="recording-filter-trigger" type="button" aria-haspopup="dialog" aria-labelledby="transfer-account-filter-label transfer-account-filter-summary"><span id="transfer-account-filter-summary">${esc(accountSummary)}</span></button></div><label>From<input id="transfer-from-filter" type="date" value="${esc(from)}"></label><label>Through<input id="transfer-through-filter" type="date" value="${esc(through)}"></label><button class="button button-outline" id="transfer-range-reset" type="button">Full account history</button><button class="button button-quiet" id="transfer-filter-reset" type="button">Reset</button></div><p class="recording-note">Date filters include a transfer when any selected account’s own posting falls in range. Each transfer appears once; default order follows destination posting dates.</p>${invalid ? '<p class="form-error" role="alert">From date must not be after Through date.</p>' : ''}${tableHTML('transfers', ['Source posted', 'Destination posted', 'Activity date', 'From', 'To', { label: 'Amount', align: 'end' }, 'Note', { label: 'Actions', align: 'end' }], items, (t) => `<tr><td>${esc(t.sourcePostedDate)}${t.sourcePostedDateUnconfirmed ? ' <span class="uncertain" title="Source posting date unconfirmed">?</span>' : ''}</td><td>${esc(t.targetPostedDate)}${t.targetPostedDateUnconfirmed ? ' <span class="uncertain" title="Destination posting date unconfirmed">?</span>' : ''}</td><td>${esc(t.activityDate || '—')}${t.activityDateUnconfirmed ? ' <span class="uncertain" title="Activity date unconfirmed">?</span>' : ''}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === t.sourceAccountId)))}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === t.targetAccountId)))}</td><td class="amount">${money(t.amountCents)}</td><td>${esc(t.note)}</td><td><div class="recording-actions">${actionButton('Edit', `data-transfer-edit="${esc(t.id)}"`)}${actionButton('Delete', `data-transfer-delete="${esc(t.id)}"`)}</div></td></tr>`, page, 20, 'No transfers in this view.')}`;
    bindPager(root, 'transfers', items.length, page, 20, render);
  }
  root.addEventListener('change', (event) => {
    const id = event.target.id;
    if (!['transfer-from-filter', 'transfer-through-filter'].includes(id)) return;
    if (id === 'transfer-from-filter') from = event.target.value;
    if (id === 'transfer-through-filter') through = event.target.value;
    page.page = 1;
    render();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'transfer-add') showTransfer();
    if (button.id === 'transfer-account-filter') showAccountFilter();
    if (button.dataset.transferEdit) showTransfer(button.dataset.transferEdit);
    if (button.dataset.transferDelete)
      confirmAction(
        'Delete transfer?',
        'This transfer is removed only if all affected account and statement checks remain valid.',
        () => ctx.command({ type: 'transfer.delete', id: button.dataset.transferDelete }),
        'Delete transfer',
      );
    if (button.id === 'transfer-range-reset') {
      from = through = '';
      page.page = 1;
      render();
    }
    if (button.id === 'transfer-filter-reset') {
      reset();
      render();
    }
  });
  return {
    render,
    showTransfer,
    reset,
  };
}
