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
      title: existing ? 'Edit purchase' : 'Add purchase',
      wide: true,
      content: `${selectField(
        'Investment account',
        'accountId',
        accountOptions(accounts, value.accountId ?? ctx.accountId),
      )}<div class="form-grid">${selectField('Holding type', 'instrument', `<option value="treasury_bill"${value.instrument !== 'asset' ? ' selected' : ''}>Treasury bill</option><option value="asset"${value.instrument === 'asset' ? ' selected' : ''}>Other holding at cost</option>`)}${field('Holding name', 'name', value.name ?? '', { required: true, attrs: 'maxlength="100"' })}</div>${datesHTML(value, 'purchase-')}<div class="form-grid">${moneyField('Purchase cost ($)', 'cost', existing ? amount(value.costCents) : '', { required: true })}${field('Quantity / shares', 'quantity', value.quantity ?? '', { type: 'number', attrs: 'min="0" step="any"' })}</div><div data-bill-fields><div class="form-grid">${moneyField('Face value ($)', 'faceValue', value.faceValueCents ? amount(value.faceValueCents) : '')}${field('Term (weeks)', 'termWeeks', value.termWeeks ?? '', { type: 'number', attrs: 'min="1" max="52" step="1" placeholder="Unknown"' })}${field('Contract maturity date', 'maturityDate', value.maturityDate ?? '', { type: 'date' })}${field('CUSIP', 'cusip', value.cusip ?? '', { attrs: 'maxlength="9" placeholder="Unknown"' })}</div><p class="cash-dialog-help">Leave unknown bill details blank. Contract maturity does not automatically create a redemption or interest.</p></div>${noteField(value.note ?? '')}<p class="cash-dialog-help">A purchase moves cash into holdings at cost. Record actual funding as a transfer.</p>`,
      submitLabel: existing ? 'Save changes' : 'Add purchase',
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
      throw new Error('Add an available holding before recording a sale or redemption.');
    const linked = l.entries.find((e) => e.id === existing?.resultEntryId),
      initialDates = existing ?? {};
    const gainCats = l.categories
      .filter((c) => c.kind === 'gain')
      .map((c) => ({ ...c, name: c.label }));
    const { form } = showForm({
      title: existing
        ? 'Edit investment activity'
        : preferredKind === 'sale'
          ? 'Record sale'
          : 'Record redemption',
      wide: true,
      content: `${selectField(
        'Holding',
        'holdingId',
        options(
          holdings.map((h) => ({ ...h, name: `${h.name} · cost ${money(h.costCents)}` })),
          initial.id,
        ),
      )}${selectField('Activity', 'kind', `<option value="redemption"${(existing?.kind ?? preferredKind ?? (initial.instrument === 'treasury_bill' ? 'redemption' : 'sale')) === 'redemption' ? ' selected' : ''}>Redemption</option><option value="sale"${(existing?.kind ?? preferredKind ?? (initial.instrument === 'treasury_bill' ? 'redemption' : 'sale')) === 'sale' ? ' selected' : ''}>Sale</option>`)}${datesHTML(initialDates, 'operation-')}${moneyField('Actual proceeds ($)', 'proceeds', existing ? amount(existing.proceedsCents) : '', { required: true })}<div class="recording-result" data-result-summary>Enter actual proceeds to review the realized result.</div><div data-result-options>${selectField('Realized result entry', 'resultMode', `<option value="new">${linked ? 'Update linked Gain/Expense' : 'Create new Gain/Expense'}</option><option value="existing"${linked ? ' selected' : ''}>${linked ? 'Keep existing Gain/Expense' : 'Select existing Gain/Expense'}</option>`)}<div data-existing-result>${selectField('Existing Gain/Expense', 'resultEntryId', '', false)}</div><div data-new-result><h3 data-result-title>Realized Gain/Expense</h3>${datesHTML(linked ?? initialDates, 'result-')}${selectField('Category', 'resultCategoryId', options(gainCats, linked?.categoryId), false)}${field('Merchant or source', 'resultMerchant', linked?.merchant ?? '', { attrs: 'maxlength="200"' })}${noteField(linked?.note ?? '', 'resultNote', 'Gain/Expense note')}</div></div>${noteField(existing?.note ?? '', 'note', 'Investment activity note')}<p class="cash-dialog-help">The result is included in proceeds once. This records the full holding; funding and payouts are separate transfers.</p>`,
      submitLabel: existing ? 'Save changes' : 'Save activity',
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
          ? 'Enter actual proceeds to review the realized result.'
          : `Purchase cost: ${money(holding.costCents)} · Proceeds: ${money(parseMoney(form.elements.proceeds.value))} · ${result === 0n ? 'No realized Gain/Expense' : `Realized ${kind === 'gain' ? 'Gain' : 'Expense'}: ${money(result < 0n ? -result : result)}`}`;
      form.querySelector('[data-result-options]').hidden = !nonzero;
      const currentCategory = form.elements.resultCategoryId.value,
        categories = l.categories
          .filter((c) => c.kind === kind)
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label));
      form.elements.resultCategoryId.innerHTML = options(
        categories.map((c) => ({ ...c, name: c.label })),
        currentCategory,
        'Choose a category',
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
        'Choose an existing entry',
      );
      const creating = form.elements.resultMode.value === 'new';
      form.querySelector('[data-new-result]').hidden = !creating;
      form.querySelector('[data-existing-result]').hidden = creating;
      form.querySelector('[data-result-title]').textContent =
        `Realized ${kind === 'gain' ? 'Gain' : 'Expense'}`;
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
      root.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`;
      return;
    }
    const holdings = summary.holdings
      .slice()
      .sort((a, b) => b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id));
    const activities = summary.activities.filter(
      (a) => (!from || a.postedDate >= from) && (!through || a.postedDate <= through),
    );
    root.innerHTML = `<section class="recording-section"><div class="recording-table-heading"><div><h2>Holdings <span class="count-pill">${holdings.length}</span></h2><p class="recording-note">Holdings at purchase cost. Status uses the Through date.</p></div><button class="button button-outline" type="button" data-investment-add>＋ Add purchase</button></div>${tableHTML('holdings', ['Purchase activity', 'Holding', { label: 'Cost', align: 'end' }, { label: 'Quantity', align: 'end' }, { label: 'Face value', align: 'end' }, 'Contract maturity', 'Status', { label: 'Actions', align: 'end' }], holdings, (h) => `<tr><td>${dateCell(h)}</td><td>${esc(h.name)}<small class="posted-date">${h.instrument === 'treasury_bill' ? 'Treasury bill' : 'Holding at cost'}${h.cusip ? ` · ${esc(h.cusip)}` : ''}</small></td><td class="amount">${money(h.costCents)}</td><td class="numeric">${esc(h.quantity ?? '—')}</td><td class="amount">${h.faceValueCents ? money(h.faceValueCents) : '—'}</td><td>${esc(h.maturityDate ?? '—')}</td><td>${h.status === 'disposed' ? 'Disposed' : h.status === 'future' ? 'Future' : 'Active'}</td><td><div class="recording-actions">${actionButton('Edit', `data-purchase-edit="${esc(h.id)}"`)}${!h.disposal ? `${actionButton('Sell', `data-holding-sale="${esc(h.id)}"`)}${h.instrument === 'treasury_bill' ? actionButton('Redeem', `data-holding-redeem="${esc(h.id)}"`) : ''}` : actionButton('Activity', `data-disposal-edit="${esc(h.disposal.id)}"`)}${actionButton('Remove', `data-purchase-delete="${esc(h.id)}"`)}</div></td></tr>`, holdingPage, 20, 'No holdings recorded for this account.')}</section><section class="recording-section"><div class="recording-table-heading"><h2>Investment activity</h2><span class="scope-note">Posting date range</span></div>${tableHTML('investment-activity', ['Activity date', 'Activity', 'Holding', { label: 'Cash change', align: 'end' }, { label: 'Realized result', align: 'end' }, 'Note', { label: 'Actions', align: 'end' }], activities, (a) => `<tr><td>${dateCell(a)}</td><td>${a.kind === 'purchase' ? 'Buy' : a.kind === 'redemption' ? 'Redeem' : 'Sell'}</td><td>${esc(a.name)}</td><td class="amount">${money(a.cashChangeCents)}</td><td class="amount">${a.resultCents ? money(a.resultCents) : '—'}</td><td>${esc(a.note)}</td><td><div class="recording-actions">${actionButton('Edit', a.kind === 'purchase' ? `data-purchase-edit="${esc(a.id)}"` : `data-disposal-edit="${esc(a.id)}"`)}${a.resultEntryId ? actionButton('Gain/Expense', `data-result-entry="${esc(a.resultEntryId)}"`) : ''}${a.kind !== 'purchase' ? actionButton('Delete', `data-disposal-delete="${esc(a.id)}"`) : ''}</div></td></tr>`, activityPage, 20, 'No investment activity in this posting-date range.')}</section>`;
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
          'Remove holding?',
          'The holding can be removed only if its investment relationships remain valid. No Gain or transfer is removed automatically.',
          () => ctx.command({ type: 'purchase.delete', id: button.dataset.purchaseDelete }),
          'Remove holding',
        );
      if (button.dataset.disposalDelete)
        confirmAction(
          'Delete investment activity?',
          'Only a removal that leaves valid links can be saved. A linked Gain/Expense is not deleted automatically.',
          () => ctx.command({ type: 'disposal.delete', id: button.dataset.disposalDelete }),
          'Delete activity',
        );
      if (button.dataset.resultEntry) ctx.showEntry?.(button.dataset.resultEntry);
    } catch (error) {
      ctx.notify(error.message, true);
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
