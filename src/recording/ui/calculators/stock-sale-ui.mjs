import {
  scopedPresentation,
  presetCurrency,
  currencyField,
  calculatorError,
  captureViewScroll,
  restoreViewScroll,
} from './shared.mjs';
import { calculateStockSale, MAX_SALE_LOTS } from '../../calculators/stock-sale.mjs';
import { esc, parseMoney, tableHTML, bindPager } from '../shared-controls.mjs';
import { createRootQuery, createDraftState } from './shared.mjs';

const PAGE_SIZE = 10;
const blankLot = (id) => ({ id, label: '', held: '', cost: '', sell: '' });
const defaults = () => ({ currency: 'USD', price: '', fees: '', lots: [blankLot('lot-1')] });
const lotInputId = (id, field) => `stock-sale-${id}-${field}`;
export function createStockSaleUI({ root, isActive, getPresentation }) {
  const $ = createRootQuery(root),
    state = createDraftState(defaults),
    page = { page: 1 };
  let currentPresentation;
  const presentation = (refresh = false) => {
    if (refresh || !currentPresentation || currentPresentation.currency !== state.draft.currency)
      currentPresentation = scopedPresentation(getPresentation, state.draft.currency);
    return currentPresentation;
  };
  const t = (...args) => presentation().t(...args),
    money = (value) => presentation().money(value),
    formatDecimal = (value, monetary = false) => presentation().decimal(value, monetary);
  const lotName = (lot, index) => lot.label || t('calc.sale.001', 'Lot {p0}', { p0: index + 1 });

  function roundingNotes(report) {
    const notes = [],
      add = (label, cents) => {
        if (cents) notes.push(`${presentation().currencyLabel(label)}: ${money(cents)}.`);
      },
      rowLabels = {
        currentBasisCents: t('calc.sale.002', 'current cost basis'),
        soldBasisCents: t('calc.sale.003', 'sold cost basis'),
        remainingBasisCents: t('calc.sale.004', 'remaining cost basis'),
        grossProceedsCents: t('calc.sale.005', 'gross proceeds'),
        gainBeforeFeesCents: t('calc.sale.006', 'gain before selling fees'),
      },
      differences = report.roundingDifferences;
    for (const [key, label] of Object.entries(rowLabels))
      add(
        t('calc.sale.007', 'Total {p0} minus the sum of displayed lot rows', { p0: label }),
        differences.rows[key],
      );
    add(t('calc.sale.008', 'Current basis minus sold and remaining basis'), differences.basisCents);
    add(
      t('calc.sale.009', 'Gain before fees minus gross proceeds less sold basis'),
      differences.gainBeforeFeesCents,
    );
    add(
      t('calc.sale.010', 'Net proceeds minus gross proceeds less selling fees'),
      differences.netProceedsCents,
    );
    add(
      t('calc.sale.011', 'Net gain/loss minus gain before fees less selling fees'),
      differences.netGainLossCents,
    );
    add(
      t('calc.sale.012', 'Net gain/loss minus net proceeds less sold basis'),
      differences.netGainFromProceedsCents,
    );
    report.lots.forEach((lot, index) => {
      add(
        t('calc.sale.013', '{p0}: current basis minus sold and remaining basis', {
          p0: lotName(lot, index),
        }),
        lot.roundingDifferences.basisCents,
      );
      add(
        t('calc.sale.014', '{p0}: gain before fees minus gross proceeds less sold basis', {
          p0: lotName(lot, index),
        }),
        lot.roundingDifferences.gainBeforeFeesCents,
      );
    });
    return notes.length
      ? `<details class="stock-sale-rounding-details"><summary>${presentation().currencyLabel(t('calc.sale.015', 'Rounding details'))}</summary><p class="recording-note">${t('calc.sale.016', 'Exact amounts are calculated before each displayed endpoint is independently rounded to cents. These display differences do not change the calculation.')}</p><ul>${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>`
      : '';
  }

  let nextLot = 2,
    scrollTop = 0,
    scrollLeft = 0,
    scrollResetPending = true,
    resetEpoch = 0,
    formNeedsRefresh = true;

  function reset() {
    state.reset();
    formNeedsRefresh = true;
    nextLot = 2;
    page.page = 1;
    scrollTop = scrollLeft = 0;
    scrollResetPending = true;
    resetEpoch++;
  }
  function readForm() {
    const form = $('stock-sale-form');
    if (!form || !root.contains(form)) return state.draft;
    return {
      currency: $('stock-sale-currency').value,
      price: $('stock-sale-price').value,
      fees: $('stock-sale-fees').value,
      lots: state.draft.lots.map((lot) => ({
        id: lot.id,
        ...Object.fromEntries(
          ['label', 'held', 'cost', 'sell'].map((field) => [
            field,
            $(lotInputId(lot.id, field)).value,
          ]),
        ),
      })),
    };
  }
  function capturePreset() {
    const current = formNeedsRefresh ? state.draft : readForm();
    return {
      currency: current.currency,
      price: current.price,
      fees: current.fees,
      lots: current.lots.map(({ label, held, cost, sell }) => ({ label, held, cost, sell })),
    };
  }
  function validatePreset(raw) {
    const keys = ['price', 'fees', 'lots'],
      lotKeys = ['label', 'held', 'cost', 'sell'];
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Reflect.ownKeys(raw).length !== keys.length + Number(Object.hasOwn(raw, 'currency')) ||
      keys.some((key) => !Object.hasOwn(raw, key))
    )
      throw calculatorError(
        'calc.sale.017',
        'Sale Gain/Loss preset inputs must contain exactly price, fees, and lots.',
      );
    const currency = presetCurrency(raw);
    for (const key of ['price', 'fees'])
      if (typeof raw[key] !== 'string' || raw[key].length > 200)
        throw calculatorError(
          'calc.sale.018',
          'Preset {p0} must be text of at most 200 characters.',
          { p0: key },
        );
    if (!Array.isArray(raw.lots) || raw.lots.length < 1 || raw.lots.length > MAX_SALE_LOTS)
      throw calculatorError('calc.sale.019', 'Preset lots must contain between 1 and {p0} rows.', {
        p0: MAX_SALE_LOTS,
      });
    const lots = Array.from(raw.lots, (lot, index) => {
      if (
        !lot ||
        typeof lot !== 'object' ||
        Array.isArray(lot) ||
        Reflect.ownKeys(lot).length !== lotKeys.length ||
        lotKeys.some((key) => !Object.hasOwn(lot, key))
      )
        throw calculatorError(
          'calc.sale.021',
          'Preset lot {p0} must contain exactly label, held, cost, and sell.',
          { p0: index + 1 },
        );
      for (const key of lotKeys) {
        const limit = key === 'label' ? 100 : 200;
        if (typeof lot[key] !== 'string' || lot[key].length > limit)
          throw calculatorError(
            'calc.sale.023',
            'Preset lot {p0} {p1} must be text of at most {p2} characters.',
            { p0: index + 1, p1: key, p2: limit },
          );
      }
      return Object.fromEntries(lotKeys.map((key) => [key, lot[key]]));
    });
    return { ...currency, price: raw.price, fees: raw.fees, lots };
  }
  function applyPreset(raw) {
    const next = validatePreset(raw);
    reset();
    state.draft = {
      ...defaults(),
      ...next,
      lots: next.lots.map((lot, index) => ({ id: `lot-${index + 1}`, ...lot })),
    };
    nextLot = next.lots.length + 1;
    if (isActive?.() !== false) render();
  }
  function captureDraft() {
    if (!state.capture(readForm())) return false;
    page.page = 1;
    return true;
  }
  function renderResults() {
    const target = $('stock-sale-results');
    if (!target) return;
    if (!state.result) {
      target.innerHTML = state.error
        ? `<p class="form-error compound-tool-error" id="stock-sale-error" role="alert" tabindex="-1">${esc(presentation().error(state.error))}</p>`
        : `<p class="recording-note compound-tool-prompt" role="status">${state.stale ? t('calc.sale.024', 'Inputs changed. Calculate again to update the results.') : t('calc.sale.025', 'Enter a sale price and each lot, then choose Calculate. At least one lot must sell a positive quantity.')}</p>`;
      return;
    }
    const report = state.result,
      returnLabel =
        report.returnPercent === null
          ? t('calc.sale.026', 'Unavailable — sold cost basis is zero')
          : `${report.returnPercent.approximate ? '≈ ' : ''}${formatDecimal(report.returnPercent.decimal)}%`;
    target.innerHTML = `<div class="summary-grid stock-sale-summary">${[
      [
        presentation().currencyLabel(t('calc.sale.027', 'Net gain/loss (pre-tax)')),
        'netGainLossCents',
        t('calc.sale.028', 'After whole-sale selling fees'),
      ],
      [
        presentation().currencyLabel(t('calc.sale.029', 'Net proceeds')),
        'netProceedsCents',
        t('calc.sale.030', 'Gross proceeds less selling fees'),
      ],
      [
        presentation().currencyLabel(t('calc.sale.031', 'Sold cost basis')),
        'soldBasisCents',
        t('calc.sale.032', 'Cost basis of the shares sold'),
      ],
    ]
      .map(
        ([label, key, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-stock-sale-value="${key}">${money(report[key])}</strong><span class="stat-caption">${caption}</span></div>`,
      )
      .join(
        '',
      )}</div><dl class="compound-tool-details stock-sale-details"><div><dt>${t('calc.sale.040', 'Shares sold')}</dt><dd data-stock-sale-value="sharesToSell">${esc(formatDecimal(report.sharesToSell))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.sale.041', 'Gross proceeds'))}</dt><dd>${money(report.grossProceedsCents)}</dd></div><div><dt>${presentation().currencyLabel(t('calc.sale.042', 'Selling fees'))}</dt><dd>${money(report.sellingFeesCents)}</dd></div><div><dt>${t('calc.sale.043', 'Return on sold cost basis')}</dt><dd>${esc(returnLabel)}</dd></div><div><dt>${t('calc.sale.044', 'Remaining shares')}</dt><dd data-stock-sale-value="sharesRemaining">${esc(formatDecimal(report.sharesRemaining))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.sale.045', 'Remaining cost basis'))}</dt><dd>${money(report.remainingBasisCents)}</dd></div></dl><section class="recording-section"><div class="recording-table-heading"><h2>${t('calc.sale.046', 'Lot results')}</h2><span class="scope-note">${t('calc.sale.047', '{p0} of {p1} lots sold · {currency}', { p0: report.soldLotCount, p1: report.lotCount, currency: presentation().currency })}</span></div>${tableHTML(
      'stock-sale-lots',
      [
        t('calc.sale.033', 'Lot'),
        { label: t('calc.sale.034', 'Shares sold'), align: 'end' },
        { label: t('calc.sale.035', 'Cost basis sold'), align: 'end', monetary: true },
        { label: t('calc.sale.036', 'Gross proceeds'), align: 'end', monetary: true },
        { label: t('calc.sale.037', 'Gain before selling fees'), align: 'end', monetary: true },
        { label: t('calc.sale.038', 'Remaining shares'), align: 'end' },
        { label: t('calc.sale.039', 'Remaining basis'), align: 'end', monetary: true },
      ],
      report.lots,
      (lot) =>
        `<tr><td>${esc(lotName(lot, report.lots.indexOf(lot)))}</td><td class="numeric">${esc(formatDecimal(lot.sharesToSell))}</td><td class="amount">${money(lot.soldBasisCents)}</td><td class="amount">${money(lot.grossProceedsCents)}</td><td class="amount">${money(lot.gainBeforeFeesCents)}</td><td class="numeric">${esc(formatDecimal(lot.sharesRemaining))}</td><td class="amount">${money(lot.remainingBasisCents)}</td></tr>`,
      page,
      PAGE_SIZE,
      undefined,
      presentation(),
    )}</section><p class="recording-note">${t('calc.sale.048', 'Lot gains are shown before selling fees. Whole-sale fees are deducted once from the combined proceeds and gain/loss, without allocating them across lots.')}</p>${roundingNotes(report)}`;
    bindPager(
      target,
      'stock-sale-lots',
      report.lots.length,
      page,
      PAGE_SIZE,
      renderResults,
      presentation(),
    );
  }
  function lotHTML(lot, index) {
    const id = (field) => lotInputId(lot.id, field),
      label = (field, text) =>
        `<label class="stock-sale-cell-label" for="${id(field)}">${text}</label>`;
    return `<tr class="stock-sale-lot" data-stock-sale-lot="${lot.id}"><th scope="row" class="stock-sale-label-cell"><div class="stock-sale-label-input"><span class="stock-sale-row-number">${index + 1}</span><div>${label('label', t('calc.sale.049', 'Lot label (optional)'))}<input id="${id('label')}" name="${lot.id}-label" type="text" autocomplete="off" maxlength="100" aria-label="${esc(t('calc.sale.053', 'Lot {p0}: label (optional)', { p0: index + 1 }))}" value="${esc(lot.label)}"></div></div></th><td>${label('held', t('calc.sale.050', 'Shares held'))}<input id="${id('held')}" name="${lot.id}-held" type="text" inputmode="decimal" autocomplete="off" placeholder="0" required aria-label="${esc(t('calc.sale.054', 'Lot {p0}: shares held', { p0: index + 1 }))}" value="${esc(lot.held)}"></td><td>${label('cost', t('calc.sale.051', 'Cost basis per share ({unit})', { unit: presentation().currency }))}<input id="${id('cost')}" name="${lot.id}-cost" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required aria-label="${esc(t('calc.sale.055', 'Lot {p0}: cost basis per share ({unit})', { p0: index + 1, unit: presentation().currency }))}" value="${esc(lot.cost)}"></td><td>${label('sell', t('calc.sale.052', 'Shares to sell'))}<input id="${id('sell')}" name="${lot.id}-sell" type="text" inputmode="decimal" autocomplete="off" placeholder="0" required aria-label="${esc(t('calc.sale.056', 'Lot {p0}: shares to sell', { p0: index + 1 }))}" value="${esc(lot.sell)}"></td><td class="stock-sale-actions-cell"><div class="stock-sale-lot-actions"><button type="button" class="button button-outline" id="${id('all')}" aria-label="${esc(t('calc.sale.057', 'Sell all shares from lot {p0}', { p0: index + 1 }))}">${t('calc.sale.060', 'Sell all')}</button><button type="button" class="button button-outline" id="${id('keep')}" aria-label="${esc(t('calc.sale.058', 'Keep all shares in lot {p0}', { p0: index + 1 }))}">${t('calc.sale.061', 'Keep all')}</button><button type="button" class="button button-outline" id="${id('remove')}" aria-label="${esc(t('calc.sale.059', 'Remove lot {p0}', { p0: index + 1 }))}"${state.draft.lots.length === 1 ? ' disabled' : ''}>${t('calc.sale.062', 'Remove lot')}</button></div></td></tr>`;
  }
  function sellAll(lotId = null) {
    captureDraft();
    for (const lot of state.draft.lots)
      if (lotId === null || lot.id === lotId) $(lotInputId(lot.id, 'sell')).value = lot.held;
    captureDraft();
    renderResults();
  }
  function keepAll(lotId) {
    captureDraft();
    $(lotInputId(lotId, 'sell')).value = '0';
    captureDraft();
    renderResults();
  }
  function draw(focusOverride = null) {
    const savedScroll = formNeedsRefresh ? null : captureViewScroll(root);
    presentation(true);
    const previousScroll = $('stock-sale-lots-scroll');
    if (!scrollResetPending && previousScroll) {
      scrollTop = previousScroll.scrollTop || 0;
      scrollLeft = previousScroll.scrollLeft || 0;
    }
    const focused = root.contains((root.ownerDocument ?? document).activeElement)
        ? (root.ownerDocument ?? document).activeElement
        : null,
      focusId = focusOverride ?? focused?.id,
      selectionStart = focused?.selectionStart,
      selectionEnd = focused?.selectionEnd;
    root.innerHTML = `<div class="compound-tool-heading"><p class="eyebrow">${t('calc.sale.064', 'CALCULATORS · STOCKS')}</p><h1>${t('calc.sale.065', 'Sale Gain/Loss')}</h1><p class="recording-note">${t('calc.sale.066', 'Estimate a partial or complete stock sale across manually entered lots at one common price. This pre-tax scenario is independent of recorded accounts.')}</p></div><form id="stock-sale-form" class="compound-tool-form">${currencyField(presentation(), 'stock-sale-currency')}<div class="stock-sale-toolbar"><button type="button" class="button button-outline" id="stock-sale-add-lot"${state.draft.lots.length >= MAX_SALE_LOTS ? ' disabled' : ''}>${t('calc.sale.067', 'Add lot')}</button><button type="button" class="button button-outline" id="stock-sale-sell-all">${t('calc.sale.068', 'Sell all shares')}</button><span class="scope-note">${t('calc.sale.069', '{p0} of {p1} lots', { p0: state.draft.lots.length, p1: MAX_SALE_LOTS })}</span></div><div class="stock-sale-lots" id="stock-sale-lots-scroll" role="region" aria-label="${esc(t('calc.sale.063', 'Editable stock lots'))}" tabindex="0"><table class="stock-sale-input-table"><thead><tr><th scope="col">${t('calc.sale.070', 'Lot label')} <span>${t('calc.sale.071', '(optional)')}</span></th><th scope="col">${t('calc.sale.072', 'Shares held')}</th><th scope="col">${t('calc.sale.073', 'Cost basis per share ({unit})', { unit: presentation().currency })}</th><th scope="col">${t('calc.sale.074', 'Shares to sell')}</th><th scope="col">${t('calc.sale.075', 'Lot actions')}</th></tr></thead><tbody>${state.draft.lots.map(lotHTML).join('')}</tbody></table></div><div id="stock-sale-common-controls" class="stock-sale-common-controls"><div class="compound-tool-fields"><label>${t('calc.sale.076', 'Sale price per share ({unit})', { unit: presentation().currency })}<input id="stock-sale-price" name="price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.price)}"></label><label>${t('calc.sale.077', 'Selling fees ({unit})', { unit: presentation().currency })} <span>${t('calc.sale.078', 'Optional')}</span><input id="stock-sale-fees" name="fees" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(state.draft.fees)}"></label></div><div class="compound-tool-actions"><button type="submit" class="button button-primary" id="stock-sale-calculate">${t('calc.sale.079', 'Calculate')}</button><button type="button" class="button button-outline" id="stock-sale-reset">${t('calc.sale.080', 'Reset calculator')}</button></div></div><p class="recording-note">${t('calc.sale.081', 'Sale price and per-share basis accept up to 6 decimal places; quantities accept up to 8. Fees accept cents and a blank fee means zero. Shares held must be positive; all other amounts may be zero. Shares to sell cannot exceed shares held.')}</p></form><div id="stock-sale-results"></div><section class="compound-tool-assumptions" aria-labelledby="stock-sale-assumptions-heading"><h2 id="stock-sale-assumptions-heading">${t('calc.sale.082', 'Calculation assumptions')}</h2><p>${t('calc.sale.083', 'All entered lots represent one stock sold at one fixed price. You choose each sale quantity; there is no automatic lot selection. Per-share cost basis should already include acquisition costs. Selling fees apply to the whole sale and are not allocated to individual lots.')}</p><p>${t('calc.sale.084', 'Exact decimal quantities and prices determine cost basis and proceeds before independent cent rounding. Results are pre-tax and exclude tax rules and account links. The calculator does not read or change financial records. Presets save inputs separately; calculation results remain temporary.')}</p></section>`;
    const form = $('stock-sale-form');
    const scroll = $('stock-sale-lots-scroll'),
      epoch = resetEpoch;
    scroll.scrollTop = scrollTop;
    scroll.scrollLeft = scrollLeft;
    scrollResetPending = false;
    scroll.addEventListener('scroll', () => {
      if (epoch !== resetEpoch || !root.contains(scroll) || scrollResetPending) return;
      scrollTop = scroll.scrollTop || 0;
      scrollLeft = scroll.scrollLeft || 0;
    });
    form.addEventListener(
      'invalid',
      (event) => {
        if (scroll.contains(event.target))
          event.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      },
      true,
    );
    const changed = () => {
      const previousCurrency = state.draft.currency,
        hadResult = state.result !== null,
        hadError = Boolean(state.error),
        updated = captureDraft();
      if (previousCurrency !== state.draft.currency) {
        draw();
        return;
      }
      if (updated && (hadResult || hadError)) renderResults();
    };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.draft = readForm();
      state.result = null;
      state.error = '';
      state.stale = false;
      page.page = 1;
      try {
        state.result = calculateStockSale({
          salePrice: state.draft.price,
          sellingFeesCents: state.draft.fees.trim() ? parseMoney(state.draft.fees) : 0,
          lots: state.draft.lots.map((lot) => ({
            id: lot.id,
            label: lot.label,
            sharesHeld: lot.held,
            costBasisPerShare: lot.cost,
            sharesToSell: lot.sell,
          })),
        });
      } catch (failure) {
        state.error = failure?.message
          ? failure
          : calculatorError('calc.sale.085', 'The stock sale could not be calculated.');
      }
      renderResults();
      if (state.error) $('stock-sale-error')?.focus();
    });
    $('stock-sale-add-lot').addEventListener('click', () => {
      captureDraft();
      if (state.draft.lots.length >= MAX_SALE_LOTS) return;
      const lot = blankLot(`lot-${nextLot++}`);
      state.capture({ ...state.draft, lots: [...state.draft.lots, lot] });
      page.page = 1;
      draw(lotInputId(lot.id, 'label'));
    });
    for (const [index, lot] of state.draft.lots.entries()) {
      $(lotInputId(lot.id, 'all')).addEventListener('click', () => sellAll(lot.id));
      $(lotInputId(lot.id, 'keep')).addEventListener('click', () => keepAll(lot.id));
      $(lotInputId(lot.id, 'remove')).addEventListener('click', () => {
        captureDraft();
        if (state.draft.lots.length === 1) return;
        const lots = state.draft.lots.filter((row) => row.id !== lot.id),
          next = lots[Math.min(index, lots.length - 1)];
        state.capture({ ...state.draft, lots });
        page.page = 1;
        draw(lotInputId(next.id, 'label'));
      });
    }
    $('stock-sale-sell-all').addEventListener('click', () => sellAll());
    $('stock-sale-reset').addEventListener('click', () => {
      reset();
      render();
      $('stock-sale-price')?.focus();
    });
    renderResults();
    formNeedsRefresh = false;
    restoreViewScroll(root, savedScroll);
    if (focusId) {
      const current = $(focusId);
      current?.focus({ preventScroll: true });
      if (focusOverride) current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (!focusOverride && Number.isInteger(selectionStart) && Number.isInteger(selectionEnd))
        current?.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
  function render() {
    if (isActive?.() === false) return;
    state.beginRender(captureDraft);
    draw();
  }
  return { render, reset, capturePreset, validatePreset, applyPreset };
}
