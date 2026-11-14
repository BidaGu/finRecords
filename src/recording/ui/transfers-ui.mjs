import { createUIHelpers } from './shared-controls.mjs';
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
  const {
    t: tr,
    error: localizeError,
    compareNames,
    unit,
    money,
    accountLabel,
    accountChoices,
    accountOptions,
    moneyField,
    selectField,
    noteField,
    actionButton,
    showForm,
    showSelectionFilter,
    confirmAction,
    tableHTML,
    bindPager,
  } = createUIHelpers(ctx);
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
      title: tr('financial.filter_accounts_42a4bf', 'Filter accounts'),
      description: tr(
        'financial.choose_one_or_more_accounts_transfers_involving_any_select_2cd0eb',
        'Choose one or more accounts. Transfers involving any selected account are included. Apply filters when ready.',
      ),
      groups: [
        {
          id: 'accounts',
          label: tr('financial.accounts_36bae3', 'Accounts'),
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
      `<div class="form-field"><label>${label}<input name="${name}" type="date" required value="${esc(value ?? localToday())}"></label><label class="date-unconfirmed"><input type="checkbox" name="${flag}"${existing?.[flag] ? ' checked' : ''}>${label} ${esc(tr('financial.unconfirmed_8a1d05', 'unconfirmed'))}</label></div>`;
    showForm({
      title: existing
        ? tr('financial.edit_transfer_3d74a5', 'Edit transfer')
        : tr('financial.add_transfer_d52a55', 'Add transfer'),
      content: `<div class="form-grid">${selectField(tr('financial.from_account_3cebdd', 'From account'), 'sourceAccountId', accountOptions(accounts, value.sourceAccountId ?? ctx.accountId))}${selectField(tr('financial.to_account_aef07b', 'To account'), 'targetAccountId', accountOptions(accounts, value.targetAccountId))}</div>${moneyField(tr('financial.amount_0dde6c', 'Amount ({currency})', { currency: unit() }), 'amount', existing ? amount(value.amountCents) : '', { required: true, attrs: 'autocomplete="off"' })}<div class="form-grid">${date(tr('financial.source_posting_date_2d56b5', 'Source posting date'), 'sourcePostedDate', 'sourcePostedDateUnconfirmed', value.sourcePostedDate)}${date(tr('financial.destination_posting_date_1e2604', 'Destination posting date'), 'targetPostedDate', 'targetPostedDateUnconfirmed', value.targetPostedDate)}</div><div class="form-field"><label>${esc(tr('financial.activity_date_14bd67', 'Activity date'))} <span>${esc(tr('financial.optional_0c6c41', 'Optional'))}</span><input name="activityDate" type="date" value="${esc(value.activityDate ?? '')}"></label><label class="date-unconfirmed"><input name="activityDateUnconfirmed" type="checkbox"${value.activityDateUnconfirmed ? ' checked' : ''}>${esc(tr('financial.activity_date_unconfirmed_c87845', 'Activity date unconfirmed'))}</label><div class="recording-mini-actions"><button class="recording-link" type="button" data-copy-date="sourcePostedDate" data-date-target="activityDate">${esc(tr('financial.use_source_posting_date_744170', 'Use source posting date'))}</button><button class="recording-link" type="button" data-copy-date="targetPostedDate" data-date-target="activityDate">${esc(tr('financial.use_destination_posting_date_c3c560', 'Use destination posting date'))}</button></div></div>${noteField(value.note ?? '')}<p class="cash-dialog-help">${esc(tr('financial.one_transfer_updates_both_accounts_on_their_own_posting_da_b8d220', 'One transfer updates both accounts on their own posting dates. It creates no Gain or Expense.'))}</p>`,
      submitLabel: existing
        ? tr('financial.save_changes_179359', 'Save changes')
        : tr('financial.add_transfer_d52a55', 'Add transfer'),
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
        ? tr('financial.all_accounts_6a19f2', 'All accounts')
        : selectedCount === 0
          ? tr('financial.no_accounts_f34b92', 'No accounts')
          : tr('ui.accountCount', '{count} of {total} accounts', {
              count: selectedCount,
              total: l.accounts.length,
            });
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
    root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">${esc(tr('financial.between_your_accounts_c63c83', 'BETWEEN YOUR ACCOUNTS'))}</p><h1>${esc(tr('financial.transfer_history_728ed7', 'Transfer history'))}</h1><p class="lead">${esc(tr('financial.move_funds_between_accounts_without_adding_gains_or_expens_a04034', 'Move funds between accounts without adding gains or expenses.'))}</p></div><button id="transfer-add" class="button button-primary" type="button"${l.accounts.length < 2 ? ' disabled' : ''}>${esc(tr('financial.add_transfer_c77b8d', '＋ Add transfer'))}</button></div><div class="recording-toolbar"><div class="recording-filter-control"><span id="transfer-account-filter-label">${esc(tr('financial.account_85dfa3', 'Account'))}</span><button id="transfer-account-filter" class="recording-filter-trigger" type="button" aria-haspopup="dialog" aria-labelledby="transfer-account-filter-label transfer-account-filter-summary"><span id="transfer-account-filter-summary">${esc(accountSummary)}</span></button></div><label>${esc(tr('financial.from_3f6605', 'From'))}<input id="transfer-from-filter" type="date" value="${esc(from)}"></label><label>${esc(tr('financial.through_553658', 'Through'))}<input id="transfer-through-filter" type="date" value="${esc(through)}"></label><button class="button button-outline" id="transfer-range-reset" type="button">${esc(tr('financial.full_account_history_2307d6', 'Full account history'))}</button><button class="button button-quiet" id="transfer-filter-reset" type="button">${esc(tr('financial.reset_44c57a', 'Reset'))}</button></div><p class="recording-note">${esc(tr('financial.date_filters_include_a_transfer_when_any_selected_account__2f2e08', 'Date filters include a transfer when any selected account’s own posting falls in range. Each transfer appears once; default order follows destination posting dates.'))}</p>${invalid ? `<p class="form-error" role="alert">${esc(tr('financial.from_date_must_not_be_after_through_date_6170fc', 'From date must not be after Through date.'))}</p>` : ''}${tableHTML('transfers', [tr('financial.source_posted_34cd2d', 'Source posted'), tr('financial.destination_posted_2aebe9', 'Destination posted'), tr('financial.activity_date_14bd67', 'Activity date'), tr('financial.from_3f6605', 'From'), tr('financial.to_ae79ea', 'To'), { label: tr('financial.amount_43dc85', 'Amount'), align: 'end', monetary: true }, tr('financial.note_2c924e', 'Note'), { label: tr('financial.actions_c3cd63', 'Actions'), align: 'end' }], items, (t) => `<tr><td>${esc(t.sourcePostedDate)}${t.sourcePostedDateUnconfirmed ? ` <span class="uncertain" title="${esc(tr('financial.source_posting_date_unconfirmed_ae727a', 'Source posting date unconfirmed'))}">?</span>` : ''}</td><td>${esc(t.targetPostedDate)}${t.targetPostedDateUnconfirmed ? ` <span class="uncertain" title="${esc(tr('financial.destination_posting_date_unconfirmed_fec9a3', 'Destination posting date unconfirmed'))}">?</span>` : ''}</td><td>${esc(t.activityDate || '—')}${t.activityDateUnconfirmed ? ` <span class="uncertain" title="${esc(tr('financial.activity_date_unconfirmed_c87845', 'Activity date unconfirmed'))}">?</span>` : ''}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === t.sourceAccountId)))}</td><td>${esc(accountLabel(l.accounts.find((a) => a.id === t.targetAccountId)))}</td><td class="amount">${money(t.amountCents)}</td><td>${esc(t.note)}</td><td><div class="recording-actions">${actionButton(tr('financial.edit_530164', 'Edit'), `data-transfer-edit="${esc(t.id)}"`)}${actionButton(tr('ui.delete', 'Delete'), `data-transfer-delete="${esc(t.id)}"`)}</div></td></tr>`, page, 20, tr('financial.no_transfers_in_this_view_463c00', 'No transfers in this view.'))}`;
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
        tr('financial.delete_transfer_763ea3', 'Delete transfer?'),
        tr(
          'financial.this_transfer_is_removed_only_if_all_affected_account_and__127036',
          'This transfer is removed only if all affected account and statement checks remain valid.',
        ),
        () => ctx.command({ type: 'transfer.delete', id: button.dataset.transferDelete }),
        tr('financial.delete_transfer_9b2a3c', 'Delete transfer'),
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
