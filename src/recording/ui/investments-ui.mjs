import { createUIHelpers } from './shared-controls.mjs';
import { investmentSummary } from '../behaviors/investment.mjs';
import {
  $,
  esc,
  money,
  actionButton,
  amount,
  parseMoney,
  newId,
  accountOptions,
  options,
  field,
  moneyField,
  selectField,
  noteField,
  datesHTML,
  readDates,
  dateCell,
  showForm,
  confirmAction,
  tableHTML,
  bindPager,
} from './shared-controls.mjs';

export function createInvestmentsUI(ctx) {
  const {
    t: tr,
    error: localizeError,
    compareNames,
    unit,
    currencyLabel,
    money,
    accountOptions,
    options,
    field,
    moneyField,
    selectField,
    noteField,
    datesHTML,
    dateCell,
    actionButton,
    showForm,
    confirmAction,
    tableHTML,
    bindPager,
  } = createUIHelpers(ctx);
  const holdingPage = { page: 1 },
    activityPage = { page: 1 };
  let previousAccount = '';
  const ledger = () => ctx.getDocument().ledger;
  function showPurchase(id = null) {
    const l = ledger(),
      existing = l.holdings.find((h) => h.id === id),
      value = existing ?? {},
      accounts = l.accounts.filter((a) => a.kind === 'investment');
    const { form } = showForm({
      title: existing
        ? tr('financial.edit_purchase_1d6499', 'Edit purchase')
        : tr('financial.add_purchase_8ba6b9', 'Add purchase'),
      wide: true,
      content: `${selectField(
        tr('financial.investment_account_f3d13a', 'Investment account'),
        'accountId',
        accountOptions(accounts, value.accountId ?? ctx.accountId),
      )}<div class="form-grid">${selectField(tr('financial.holding_type_c5ac4d', 'Holding type'), 'instrument', `<option value="treasury_bill"${value.instrument !== 'asset' ? ' selected' : ''}>${esc(tr('financial.treasury_bill_b32de4', 'Treasury bill'))}</option><option value="asset"${value.instrument === 'asset' ? ' selected' : ''}>${esc(tr('financial.other_holding_at_cost_72dbe1', 'Other holding at cost'))}</option>`)}${field(tr('financial.holding_name_833cf8', 'Holding name'), 'name', value.name ?? '', { required: true, attrs: 'maxlength="100"' })}</div>${datesHTML(value, 'purchase-')}<div class="form-grid">${moneyField(tr('financial.purchase_cost_805c58', 'Purchase cost ({currency})', { currency: unit() }), 'cost', existing ? amount(value.costCents) : '', { required: true })}${field(tr('financial.quantity_shares_127e3b', 'Quantity / shares'), 'quantity', value.quantity ?? '', { type: 'number', attrs: 'min="0" step="any"' })}</div><div data-bill-fields><div class="form-grid">${moneyField(tr('financial.face_value_ac197a', 'Face value ({currency})', { currency: unit() }), 'faceValue', value.faceValueCents ? amount(value.faceValueCents) : '')}${field(tr('financial.term_weeks_26d10f', 'Term (weeks)'), 'termWeeks', value.termWeeks ?? '', { type: 'number', attrs: `min="1" max="52" step="1" placeholder="${esc(tr('ui.unknown', 'Unknown'))}"` })}${field(tr('financial.contract_maturity_date_96c6aa', 'Contract maturity date'), 'maturityDate', value.maturityDate ?? '', { type: 'date' })}${field(tr('financial.cusip_595a6f', 'CUSIP'), 'cusip', value.cusip ?? '', { attrs: `maxlength="9" placeholder="${esc(tr('ui.unknown', 'Unknown'))}"` })}</div><p class="cash-dialog-help">${esc(tr('financial.leave_unknown_bill_details_blank_contract_maturity_does_no_3839db', 'Leave unknown bill details blank. Contract maturity does not automatically create a redemption or interest.'))}</p></div>${noteField(value.note ?? '')}<p class="cash-dialog-help">${esc(tr('financial.a_purchase_moves_cash_into_holdings_at_cost_record_actual__d84f63', 'A purchase moves cash into holdings at cost. Record actual funding as a transfer.'))}</p>`,
      submitLabel: existing
        ? tr('financial.save_changes_179359', 'Save changes')
        : tr('financial.add_purchase_8ba6b9', 'Add purchase'),
      onSave: (f, d) => {
        const next = {
          id: existing?.id ?? newId('holding'),
          ...(existing ? { createdAt: existing.createdAt, updatedAt: undefined } : {}),
          accountId: f.elements.accountId.value,
          instrument: f.elements.instrument.value,
          name: f.elements.name.value.trim(),
          costCents: parseMoney(f.elements.cost.value),
          ...readDates(f, 'purchase-'),
          note: f.elements.note.value.trim(),
        };
        if (f.elements.quantity.value.trim()) next.quantity = Number(f.elements.quantity.value);
        if (next.instrument === 'treasury_bill') {
          if (f.elements.faceValue.value.trim())
            next.faceValueCents = parseMoney(f.elements.faceValue.value);
          if (f.elements.termWeeks.value.trim())
            next.termWeeks = Number(f.elements.termWeeks.value);
          if (f.elements.maturityDate.value) next.maturityDate = f.elements.maturityDate.value;
          if (f.elements.cusip.value.trim()) next.cusip = f.elements.cusip.value.trim();
        }
        ctx.command({ type: 'purchase.save', value: next });
        d.close();
      },
    });
    function updateType() {
      const bill = form.elements.instrument.value === 'treasury_bill';
      form.querySelector('[data-bill-fields]').hidden = !bill;
      for (const name of ['faceValue', 'termWeeks', 'maturityDate', 'cusip'])
        form.elements[name].disabled = !bill;
    }
    form.elements.instrument.addEventListener('change', updateType);
    updateType();
  }
  function showDisposal(id = null, holdingId = null, preferredKind = null) {
    const l = ledger(),
      existing = l.investmentActivities.find((a) => a.id === id),
      used = new Set(l.investmentActivities.filter((a) => a.id !== id).map((a) => a.holdingId));
    const holdings = l.holdings.filter(
      (h) => h.accountId === (existing?.accountId ?? ctx.accountId) && !used.has(h.id),
    );
    const initial =
      holdings.find((h) => h.id === (existing?.holdingId ?? holdingId)) ?? holdings[0];
    if (!initial)
      throw Object.assign(
        new Error('Add an available holding before recording a sale or redemption.'),
        { code: 'ui.availableHolding', params: {} },
      );
    const linked = l.entries.find((e) => e.id === existing?.resultEntryId),
      initialDates = existing ?? {};
    const gainCats = l.categories
      .filter((c) => c.kind === 'gain')
      .map((c) => ({ ...c, name: c.label }));
    const { form } = showForm({
      title: existing
        ? tr('financial.edit_investment_activity_06dfb8', 'Edit investment activity')
        : preferredKind === 'sale'
          ? tr('financial.record_sale_0b1390', 'Record sale')
          : tr('financial.record_redemption_277140', 'Record redemption'),
      wide: true,
      content: `${selectField(
        tr('financial.money.holdingCostLabel', 'Holding / purchase cost ({currency})', {
          currency: unit(),
        }),
        'holdingId',
        options(
          holdings.map((h) => ({
            ...h,
            name: tr('ui.holdingCost', '{name} · cost {cost}', {
              name: h.name,
              cost: money(h.costCents),
            }),
          })),
          initial.id,
        ),
      )}${selectField(tr('financial.activity_81c0d9', 'Activity'), 'kind', `<option value="redemption"${(existing?.kind ?? preferredKind ?? (initial.instrument === 'treasury_bill' ? 'redemption' : 'sale')) === 'redemption' ? ' selected' : ''}>${esc(tr('financial.redemption_843604', 'Redemption'))}</option><option value="sale"${(existing?.kind ?? preferredKind ?? (initial.instrument === 'treasury_bill' ? 'redemption' : 'sale')) === 'sale' ? ' selected' : ''}>${esc(tr('financial.sale_0028d7', 'Sale'))}</option>`)}${datesHTML(initialDates, 'operation-')}${moneyField(tr('financial.actual_proceeds_568812', 'Actual proceeds ({currency})', { currency: unit() }), 'proceeds', existing ? amount(existing.proceedsCents) : '', { required: true })}<div class="recording-result" data-result-summary>${esc(tr('financial.enter_actual_proceeds_to_review_the_realized_result_eaee6b', 'Enter actual proceeds to review the realized result.'))}</div><div data-result-options>${selectField(tr('financial.realized_result_entry_60f88f', 'Realized result entry'), 'resultMode', `<option value="new">${linked ? tr('financial.update_linked_gain_expense_ce0fe5', 'Update linked Gain/Expense') : tr('financial.create_new_gain_expense_8c1b32', 'Create new Gain/Expense')}</option><option value="existing"${linked ? ' selected' : ''}>${linked ? tr('financial.keep_existing_gain_expense_f9bc72', 'Keep existing Gain/Expense') : tr('financial.select_existing_gain_expense_87f1c6', 'Select existing Gain/Expense')}</option>`)}<div data-existing-result>${selectField(currencyLabel(tr('financial.existing_gain_expense_b2c54d', 'Existing Gain/Expense')), 'resultEntryId', '', false)}</div><div data-new-result><h3 data-result-title>${esc(currencyLabel(tr('financial.realized_gain_expense_c0f934', 'Realized Gain/Expense')))}</h3>${datesHTML(linked ?? initialDates, 'result-')}${selectField(tr('financial.category_a3c686', 'Category'), 'resultCategoryId', options(gainCats, linked?.categoryId), false)}${field(tr('financial.merchant_or_source_edb6cc', 'Merchant or source'), 'resultMerchant', linked?.merchant ?? '', { attrs: 'maxlength="200"' })}${noteField(linked?.note ?? '', 'resultNote', tr('financial.gain_expense_note_87c608', 'Gain/Expense note'))}</div></div>${noteField(existing?.note ?? '', 'note', tr('financial.investment_activity_note_23f262', 'Investment activity note'))}<p class="cash-dialog-help">${esc(tr('financial.the_result_is_included_in_proceeds_once_this_records_the_f_69526a', 'The result is included in proceeds once. This records the full holding; funding and payouts are separate transfers.'))}</p>`,
      submitLabel: existing
        ? tr('financial.save_changes_179359', 'Save changes')
        : tr('financial.save_activity_6056aa', 'Save activity'),
      onSave: (f, d) => {
        const holding = l.holdings.find((h) => h.id === f.elements.holdingId.value),
          proceedsCents = parseMoney(f.elements.proceeds.value),
          result = BigInt(proceedsCents) - BigInt(holding.costCents);
        const value = {
          ...existing,
          id: existing?.id ?? newId('activity'),
          holdingId: holding.id,
          accountId: holding.accountId,
          kind: f.elements.kind.value,
          proceedsCents,
          ...readDates(f, 'operation-'),
          note: f.elements.note.value.trim(),
          updatedAt: undefined,
          resultMode: result === 0n ? 'none' : f.elements.resultMode.value,
        };
        if (result !== 0n && value.resultMode === 'existing')
          value.resultEntryId = f.elements.resultEntryId.value;
        else if (result !== 0n)
          value.resultEntry = {
            ...(linked ?? {}),
            kind: result < 0n ? 'expense' : 'gain',
            accountId: holding.accountId,
            amountCents: Number(result < 0n ? -result : result),
            ...readDates(f, 'result-'),
            categoryId: f.elements.resultCategoryId.value,
            merchant: f.elements.resultMerchant.value.trim(),
            note: f.elements.resultNote.value.trim(),
            updatedAt: undefined,
          };
        ctx.command({ type: 'disposal.save', value });
        d.close();
      },
    });
    let resultDatesSeeded = Boolean(linked);
    function refresh() {
      const holding = l.holdings.find((h) => h.id === form.elements.holdingId.value),
        redemption = form.elements.kind.querySelector('[value=redemption]');
      redemption.disabled = holding.instrument !== 'treasury_bill';
      if (redemption.disabled && form.elements.kind.value === 'redemption')
        form.elements.kind.value = 'sale';
      let result = null;
      try {
        result = BigInt(parseMoney(form.elements.proceeds.value)) - BigInt(holding.costCents);
      } catch {}
      const kind = result !== null && result < 0n ? 'expense' : 'gain',
        nonzero = result !== null && result !== 0n;
      if (nonzero && !resultDatesSeeded) {
        form.elements['result-activityDate'].value = form.elements['operation-activityDate'].value;
        form.elements['result-postedDate'].value = form.elements['operation-postedDate'].value;
        form.elements['result-activityDateUnconfirmed'].checked =
          form.elements['operation-activityDateUnconfirmed'].checked;
        form.elements['result-postedDateUnconfirmed'].checked =
          form.elements['operation-postedDateUnconfirmed'].checked;
        resultDatesSeeded = true;
      }
      form.querySelector('[data-result-summary]').textContent =
        result === null
          ? tr(
              'financial.enter_actual_proceeds_to_review_the_realized_result_eaee6b',
              'Enter actual proceeds to review the realized result.',
            )
          : tr(
              'financial.money.proceedsSummary',
              'Purchase cost ({currency}): {cost} · Proceeds ({currency}): {proceeds} · {result}',
              {
                currency: unit(),
                cost: money(holding.costCents),
                proceeds: money(parseMoney(form.elements.proceeds.value)),
                result:
                  result === 0n
                    ? tr('financial.no_realized_gain_expense_59284f', 'No realized Gain/Expense')
                    : tr(
                        'financial.money.realizedResult',
                        'Realized {kind} ({currency}): {amount}',
                        {
                          currency: unit(),
                          kind:
                            kind === 'gain'
                              ? tr('financial.gain_96dd91', 'Gain')
                              : tr('financial.expense_a0db8e', 'Expense'),
                          amount: money(result < 0n ? -result : result),
                        },
                      ),
              },
            );
      form.querySelector('[data-result-options]').hidden = !nonzero;
      const currentCategory = form.elements.resultCategoryId.value,
        categories = l.categories
          .filter((c) => c.kind === kind)
          .slice()
          .sort((a, b) => compareNames(a.label, b.label));
      form.elements.resultCategoryId.innerHTML = options(
        categories.map((c) => ({ ...c, name: c.label })),
        currentCategory,
        tr('financial.choose_a_category_b91bf5', 'Choose a category'),
      );
      const eligible = l.entries.filter(
        (e) =>
          e.id === linked?.id ||
          (e.accountId === holding.accountId &&
            e.kind === kind &&
            result !== null &&
            BigInt(e.amountCents) === (result < 0n ? -result : result) &&
            !l.investmentActivities.some((a) => a.id !== existing?.id && a.resultEntryId === e.id)),
      );
      const selected = form.elements.resultEntryId.value || linked?.id;
      form.elements.resultEntryId.innerHTML = options(
        eligible.map((e) => ({
          ...e,
          name: `${e.activityDate} · ${money(e.amountCents)} · ${e.merchant || e.note || e.kind}`,
        })),
        selected,
        tr('financial.choose_an_existing_entry_28eadd', 'Choose an existing entry'),
      );
      const creating = form.elements.resultMode.value === 'new';
      form.querySelector('[data-new-result]').hidden = !creating;
      form.querySelector('[data-existing-result]').hidden = creating;
      form.querySelector('[data-result-title]').textContent = currencyLabel(
        tr('ui.realizedKind', 'Realized {kind}', {
          kind:
            kind === 'gain'
              ? tr('financial.gain_96dd91', 'Gain')
              : tr('financial.expense_a0db8e', 'Expense'),
        }),
      );
      for (const name of [
        'result-activityDate',
        'result-postedDate',
        'result-activityDateUnconfirmed',
        'result-postedDateUnconfirmed',
        'resultCategoryId',
        'resultMerchant',
        'resultNote',
      ])
        form.elements[name].disabled = !nonzero || !creating;
      form.elements['result-activityDate'].required =
        form.elements['result-postedDate'].required =
        form.elements.resultCategoryId.required =
          nonzero && creating;
      form.elements.resultEntryId.disabled = !nonzero || creating;
      form.elements.resultEntryId.required = nonzero && !creating;
    }
    form.elements.proceeds.addEventListener('input', refresh);
    for (const name of ['holdingId', 'kind', 'resultMode'])
      form.elements[name].addEventListener('change', refresh);
    refresh();
  }
  function render() {
    const root = $('investments-content');
    if (!root) return;
    const l = ledger(),
      account = l.accounts.find((a) => a.id === ctx.accountId);
    if (!account || account.kind !== 'investment') {
      root.innerHTML = '';
      return;
    }
    if (previousAccount !== account.id) {
      previousAccount = account.id;
      holdingPage.page = activityPage.page = 1;
    }
    const from = $('cash-start-date')?.value ?? '',
      through = $('cash-end-date')?.value ?? '';
    let summary;
    try {
      summary = investmentSummary(l, account.id, { through });
    } catch (error) {
      root.innerHTML = `<p class="form-error" role="alert">${esc(localizeError(error))}</p>`;
      return;
    }
    const holdings = summary.holdings
      .slice()
      .sort((a, b) => b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id));
    const activities = summary.activities.filter(
      (a) => (!from || a.postedDate >= from) && (!through || a.postedDate <= through),
    );
    root.innerHTML = `<section class="recording-section"><div class="recording-table-heading"><div><h2>${esc(tr('financial.holdings_72f9d3', 'Holdings'))} <span class="count-pill">${holdings.length}</span></h2><p class="recording-note">${esc(tr('financial.holdings_at_purchase_cost_status_uses_the_through_date_fe8128', 'Holdings at purchase cost. Status uses the Through date.'))}</p></div><button class="button button-outline" type="button" data-investment-add>${esc(tr('financial.add_purchase_356d9c', '＋ Add purchase'))}</button></div>${tableHTML('holdings', [tr('financial.purchase_activity_dc2c70', 'Purchase activity'), tr('financial.holding_1df195', 'Holding'), { label: tr('financial.cost_64ae43', 'Cost'), align: 'end', monetary: true }, { label: tr('financial.quantity_44f6af', 'Quantity'), align: 'end' }, { label: tr('financial.face_value_40f915', 'Face value'), align: 'end', monetary: true }, tr('financial.contract_maturity_a717bb', 'Contract maturity'), tr('financial.status_bae7d5', 'Status'), { label: tr('financial.actions_c3cd63', 'Actions'), align: 'end' }], holdings, (h) => `<tr><td>${dateCell(h)}</td><td>${esc(h.name)}<small class="posted-date">${h.instrument === 'treasury_bill' ? tr('financial.treasury_bill_b32de4', 'Treasury bill') : tr('financial.holding_at_cost_816531', 'Holding at cost')}${h.cusip ? ` · ${esc(h.cusip)}` : ''}</small></td><td class="amount">${money(h.costCents)}</td><td class="numeric">${esc(h.quantity ?? '—')}</td><td class="amount">${h.faceValueCents ? money(h.faceValueCents) : '—'}</td><td>${esc(h.maturityDate ?? '—')}</td><td>${h.status === 'disposed' ? tr('financial.disposed_1397ce', 'Disposed') : h.status === 'future' ? tr('financial.future_047ca5', 'Future') : tr('financial.active_a733b8', 'Active')}</td><td><div class="recording-actions">${actionButton(tr('financial.edit_530164', 'Edit'), `data-purchase-edit="${esc(h.id)}"`)}${!h.disposal ? `${actionButton(tr('financial.sell_fa3cf2', 'Sell'), `data-holding-sale="${esc(h.id)}"`)}${h.instrument === 'treasury_bill' ? actionButton(tr('financial.redeem_db3f81', 'Redeem'), `data-holding-redeem="${esc(h.id)}"`) : ''}` : actionButton(tr('financial.activity_81c0d9', 'Activity'), `data-disposal-edit="${esc(h.disposal.id)}"`)}${actionButton(tr('financial.remove_e96390', 'Remove'), `data-purchase-delete="${esc(h.id)}"`)}</div></td></tr>`, holdingPage, 20, tr('financial.no_holdings_recorded_for_this_account_827b2c', 'No holdings recorded for this account.'))}</section><section class="recording-section"><div class="recording-table-heading"><h2>${esc(tr('financial.investment_activity_f52165', 'Investment activity'))}</h2><span class="scope-note">${esc(tr('financial.posting_date_range_a7b571', 'Posting date range'))}</span></div>${tableHTML('investment-activity', [tr('financial.activity_date_14bd67', 'Activity date'), tr('financial.activity_81c0d9', 'Activity'), tr('financial.holding_1df195', 'Holding'), { label: tr('financial.cash_change_e88e53', 'Cash change'), align: 'end', monetary: true }, { label: tr('financial.realized_result_a229ad', 'Realized result'), align: 'end', monetary: true }, tr('financial.note_2c924e', 'Note'), { label: tr('financial.actions_c3cd63', 'Actions'), align: 'end' }], activities, (a) => `<tr><td>${dateCell(a)}</td><td>${a.kind === 'purchase' ? tr('financial.buy_7ceca5', 'Buy') : a.kind === 'redemption' ? tr('financial.redeem_db3f81', 'Redeem') : tr('financial.sell_fa3cf2', 'Sell')}</td><td>${esc(a.name)}</td><td class="amount">${money(a.cashChangeCents)}</td><td class="amount">${a.resultCents ? money(a.resultCents) : '—'}</td><td>${esc(a.note)}</td><td><div class="recording-actions">${actionButton(tr('financial.edit_530164', 'Edit'), a.kind === 'purchase' ? `data-purchase-edit="${esc(a.id)}"` : `data-disposal-edit="${esc(a.id)}"`)}${a.resultEntryId ? actionButton(tr('financial.gain_expense_645dcb', 'Gain/Expense'), `data-result-entry="${esc(a.resultEntryId)}"`) : ''}${a.kind !== 'purchase' ? actionButton(tr('ui.delete', 'Delete'), `data-disposal-delete="${esc(a.id)}"`) : ''}</div></td></tr>`, activityPage, 20, tr('financial.no_investment_activity_in_this_posting_date_range_fe62a6', 'No investment activity in this posting-date range.'))}</section>`;
    bindPager(root, 'holdings', holdings.length, holdingPage, 20, render);
    bindPager(root, 'investment-activity', activities.length, activityPage, 20, render);
  }
  $('accounts-panel').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.hasAttribute('data-investment-add')) showPurchase();
      if (button.dataset.purchaseEdit) showPurchase(button.dataset.purchaseEdit);
      if (button.dataset.holdingSale) showDisposal(null, button.dataset.holdingSale, 'sale');
      if (button.dataset.holdingRedeem)
        showDisposal(null, button.dataset.holdingRedeem, 'redemption');
      if (button.dataset.disposalEdit) showDisposal(button.dataset.disposalEdit);
      if (button.dataset.purchaseDelete)
        confirmAction(
          tr('financial.remove_holding_aa2652', 'Remove holding?'),
          tr(
            'financial.the_holding_can_be_removed_only_if_its_investment_relation_cb96c4',
            'The holding can be removed only if its investment relationships remain valid. No Gain or transfer is removed automatically.',
          ),
          () => ctx.command({ type: 'purchase.delete', id: button.dataset.purchaseDelete }),
          tr('financial.remove_holding_b962be', 'Remove holding'),
        );
      if (button.dataset.disposalDelete)
        confirmAction(
          tr('financial.delete_investment_activity_ff96ab', 'Delete investment activity?'),
          tr(
            'financial.only_a_removal_that_leaves_valid_links_can_be_saved_a_link_a4099f',
            'Only a removal that leaves valid links can be saved. A linked Gain/Expense is not deleted automatically.',
          ),
          () => ctx.command({ type: 'disposal.delete', id: button.dataset.disposalDelete }),
          tr('financial.delete_activity_8e42c0', 'Delete activity'),
        );
      if (button.dataset.resultEntry) ctx.showEntry?.(button.dataset.resultEntry);
    } catch (error) {
      ctx.notify(error, true);
    }
  });
  return {
    render,
    showPurchase,
    showDisposal,
    reset: () => {
      previousAccount = '';
      holdingPage.page = activityPage.page = 1;
    },
  };
}
