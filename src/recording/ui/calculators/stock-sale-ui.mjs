import { calculateStockSale, MAX_SALE_LOTS } from '../../calculators/stock-sale.mjs';
import { esc, money, parseMoney, tableHTML, bindPager } from '../shared-controls.mjs';
import { createRootQuery, createDraftState, formatDecimal } from './shared.mjs';

const PAGE_SIZE = 10;
const blankLot = (id) => ({ id, label: '', held: '', cost: '', sell: '' });
const defaults = () => ({ price: '', fees: '', lots: [blankLot('lot-1')] });
const lotInputId = (id, field) => `stock-sale-${id}-${field}`;
const lotName = (lot, index) => lot.label || `Lot ${index + 1}`;

function roundingNotes(report) {
  const notes = [],
    add = (label, cents) => {
      if (cents) notes.push(`${label}: ${money(cents)}.`);
    },
    rowLabels = {
      currentBasisCents: 'current cost basis',
      soldBasisCents: 'sold cost basis',
      remainingBasisCents: 'remaining cost basis',
      grossProceedsCents: 'gross proceeds',
      gainBeforeFeesCents: 'gain before selling fees',
    },
    differences = report.roundingDifferences;
  for (const [key, label] of Object.entries(rowLabels))
    add(`Total ${label} minus the sum of displayed lot rows`, differences.rows[key]);
  add('Current basis minus sold and remaining basis', differences.basisCents);
  add('Gain before fees minus gross proceeds less sold basis', differences.gainBeforeFeesCents);
  add('Net proceeds minus gross proceeds less selling fees', differences.netProceedsCents);
  add('Net gain/loss minus gain before fees less selling fees', differences.netGainLossCents);
  add('Net gain/loss minus net proceeds less sold basis', differences.netGainFromProceedsCents);
  report.lots.forEach((lot, index) => {
    add(
      `${lotName(lot, index)}: current basis minus sold and remaining basis`,
      lot.roundingDifferences.basisCents,
    );
    add(
      `${lotName(lot, index)}: gain before fees minus gross proceeds less sold basis`,
      lot.roundingDifferences.gainBeforeFeesCents,
    );
  });
  return notes.length
    ? `<details class="stock-sale-rounding-details"><summary>Rounding details</summary><p class="recording-note">Exact amounts are calculated before each displayed endpoint is independently rounded to cents. These display differences do not change the calculation.</p><ul>${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>`
    : '';
}

export function createStockSaleUI({ root, isActive }) {
  const $ = createRootQuery(root),
    state = createDraftState(defaults),
    page = { page: 1 };
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
      Reflect.ownKeys(raw).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(raw, key))
    )
      throw new Error('Sale Gain/Loss preset inputs must contain exactly price, fees, and lots.');
    for (const key of ['price', 'fees'])
      if (typeof raw[key] !== 'string' || raw[key].length > 200)
        throw new Error(`Preset ${key} must be text of at most 200 characters.`);
    if (!Array.isArray(raw.lots) || raw.lots.length < 1 || raw.lots.length > MAX_SALE_LOTS)
      throw new Error(`Preset lots must contain between 1 and ${MAX_SALE_LOTS} rows.`);
    const lots = Array.from(raw.lots, (lot, index) => {
      if (
        !lot ||
        typeof lot !== 'object' ||
        Array.isArray(lot) ||
        Reflect.ownKeys(lot).length !== lotKeys.length ||
        lotKeys.some((key) => !Object.hasOwn(lot, key))
      )
        throw new Error(
          `Preset lot ${index + 1} must contain exactly label, held, cost, and sell.`,
        );
      for (const key of lotKeys) {
        const limit = key === 'label' ? 100 : 200;
        if (typeof lot[key] !== 'string' || lot[key].length > limit)
          throw new Error(
            `Preset lot ${index + 1} ${key} must be text of at most ${limit} characters.`,
          );
      }
      return Object.fromEntries(lotKeys.map((key) => [key, lot[key]]));
    });
    return { price: raw.price, fees: raw.fees, lots };
  }
  function applyPreset(raw) {
    const next = validatePreset(raw);
    reset();
    state.draft = {
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
        ? `<p class="form-error compound-tool-error" id="stock-sale-error" role="alert" tabindex="-1">${esc(state.error)}</p>`
        : `<p class="recording-note compound-tool-prompt" role="status">${state.stale ? 'Inputs changed. Calculate again to update the results.' : 'Enter a sale price and each lot, then choose Calculate. At least one lot must sell a positive quantity.'}</p>`;
      return;
    }
    const report = state.result,
      returnLabel =
        report.returnPercent === null
          ? 'Unavailable — sold cost basis is zero'
          : `${report.returnPercent.approximate ? '≈ ' : ''}${formatDecimal(report.returnPercent.decimal)}%`;
    target.innerHTML = `<div class="summary-grid stock-sale-summary">${[
      ['Net gain/loss (pre-tax)', 'netGainLossCents', 'After whole-sale selling fees'],
      ['Net proceeds', 'netProceedsCents', 'Gross proceeds less selling fees'],
      ['Sold cost basis', 'soldBasisCents', 'Cost basis of the shares sold'],
    ]
      .map(
        ([label, key, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-stock-sale-value="${key}">${money(report[key])}</strong><span class="stat-caption">${caption}</span></div>`,
      )
      .join(
        '',
      )}</div><dl class="compound-tool-details stock-sale-details"><div><dt>Shares sold</dt><dd data-stock-sale-value="sharesToSell">${esc(formatDecimal(report.sharesToSell))}</dd></div><div><dt>Gross proceeds</dt><dd>${money(report.grossProceedsCents)}</dd></div><div><dt>Selling fees</dt><dd>${money(report.sellingFeesCents)}</dd></div><div><dt>Return on sold cost basis</dt><dd>${esc(returnLabel)}</dd></div><div><dt>Remaining shares</dt><dd data-stock-sale-value="sharesRemaining">${esc(formatDecimal(report.sharesRemaining))}</dd></div><div><dt>Remaining cost basis</dt><dd>${money(report.remainingBasisCents)}</dd></div></dl><section class="recording-section"><div class="recording-table-heading"><h2>Lot results</h2><span class="scope-note">${report.soldLotCount} of ${report.lotCount} lots sold · USD</span></div>${tableHTML(
      'stock-sale-lots',
      [
        'Lot',
        { label: 'Shares sold', align: 'end' },
        { label: 'Cost basis sold', align: 'end' },
        { label: 'Gross proceeds', align: 'end' },
        { label: 'Gain before selling fees', align: 'end' },
        { label: 'Remaining shares', align: 'end' },
        { label: 'Remaining basis', align: 'end' },
      ],
      report.lots,
      (lot) =>
        `<tr><td>${esc(lotName(lot, report.lots.indexOf(lot)))}</td><td class="numeric">${esc(formatDecimal(lot.sharesToSell))}</td><td class="amount">${money(lot.soldBasisCents)}</td><td class="amount">${money(lot.grossProceedsCents)}</td><td class="amount">${money(lot.gainBeforeFeesCents)}</td><td class="numeric">${esc(formatDecimal(lot.sharesRemaining))}</td><td class="amount">${money(lot.remainingBasisCents)}</td></tr>`,
      page,
      PAGE_SIZE,
    )}</section><p class="recording-note">Lot gains are shown before selling fees. Whole-sale fees are deducted once from the combined proceeds and gain/loss, without allocating them across lots.</p>${roundingNotes(report)}`;
    bindPager(target, 'stock-sale-lots', report.lots.length, page, PAGE_SIZE, renderResults);
  }
  function lotHTML(lot, index) {
    const id = (field) => lotInputId(lot.id, field),
      label = (field, text) =>
        `<label class="stock-sale-cell-label" for="${id(field)}">${text}</label>`;
    return `<tr class="stock-sale-lot" data-stock-sale-lot="${lot.id}"><th scope="row" class="stock-sale-label-cell"><div class="stock-sale-label-input"><span class="stock-sale-row-number">${index + 1}</span><div>${label('label', 'Lot label (optional)')}<input id="${id('label')}" name="${lot.id}-label" type="text" autocomplete="off" maxlength="100" aria-label="Lot ${index + 1}: label (optional)" value="${esc(lot.label)}"></div></div></th><td>${label('held', 'Shares held')}<input id="${id('held')}" name="${lot.id}-held" type="text" inputmode="decimal" autocomplete="off" placeholder="0" required aria-label="Lot ${index + 1}: shares held" value="${esc(lot.held)}"></td><td>${label('cost', 'Cost basis per share ($)')}<input id="${id('cost')}" name="${lot.id}-cost" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required aria-label="Lot ${index + 1}: cost basis per share ($)" value="${esc(lot.cost)}"></td><td>${label('sell', 'Shares to sell')}<input id="${id('sell')}" name="${lot.id}-sell" type="text" inputmode="decimal" autocomplete="off" placeholder="0" required aria-label="Lot ${index + 1}: shares to sell" value="${esc(lot.sell)}"></td><td class="stock-sale-actions-cell"><div class="stock-sale-lot-actions"><button type="button" class="button button-outline" id="${id('all')}" aria-label="Sell all shares from lot ${index + 1}">Sell all</button><button type="button" class="button button-outline" id="${id('keep')}" aria-label="Keep all shares in lot ${index + 1}">Keep all</button><button type="button" class="button button-outline" id="${id('remove')}" aria-label="Remove lot ${index + 1}"${state.draft.lots.length === 1 ? ' disabled' : ''}>Remove lot</button></div></td></tr>`;
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
    root.innerHTML = `<div class="compound-tool-heading"><p class="eyebrow">CALCULATORS · STOCKS</p><h1>Sale Gain/Loss</h1><p class="recording-note">Estimate a partial or complete stock sale across manually entered lots at one common price. This pre-tax scenario is independent of recorded accounts.</p></div><form id="stock-sale-form" class="compound-tool-form"><div class="stock-sale-toolbar"><button type="button" class="button button-outline" id="stock-sale-add-lot"${state.draft.lots.length >= MAX_SALE_LOTS ? ' disabled' : ''}>Add lot</button><button type="button" class="button button-outline" id="stock-sale-sell-all">Sell all shares</button><span class="scope-note">${state.draft.lots.length} of ${MAX_SALE_LOTS} lots</span></div><div class="stock-sale-lots" id="stock-sale-lots-scroll" role="region" aria-label="Editable stock lots" tabindex="0"><table class="stock-sale-input-table"><thead><tr><th scope="col">Lot label <span>(optional)</span></th><th scope="col">Shares held</th><th scope="col">Cost basis per share ($)</th><th scope="col">Shares to sell</th><th scope="col">Lot actions</th></tr></thead><tbody>${state.draft.lots.map(lotHTML).join('')}</tbody></table></div><div id="stock-sale-common-controls" class="stock-sale-common-controls"><div class="compound-tool-fields"><label>Sale price per share ($)<input id="stock-sale-price" name="price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.price)}"></label><label>Selling fees ($) <span>Optional</span><input id="stock-sale-fees" name="fees" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(state.draft.fees)}"></label></div><div class="compound-tool-actions"><button type="submit" class="button button-primary" id="stock-sale-calculate">Calculate</button><button type="button" class="button button-outline" id="stock-sale-reset">Reset calculator</button></div></div><p class="recording-note">Sale price and per-share basis accept up to 6 decimal places; quantities accept up to 8. Fees accept cents and a blank fee means zero. Shares held must be positive; all other amounts may be zero. Shares to sell cannot exceed shares held.</p></form><div id="stock-sale-results"></div><section class="compound-tool-assumptions" aria-labelledby="stock-sale-assumptions-heading"><h2 id="stock-sale-assumptions-heading">Calculation assumptions</h2><p>All entered lots represent one stock sold at one fixed price. You choose each sale quantity; there is no automatic lot selection. Per-share cost basis should already include acquisition costs. Selling fees apply to the whole sale and are not allocated to individual lots.</p><p>Exact decimal quantities and prices determine cost basis and proceeds before independent cent rounding. Results are pre-tax and exclude tax rules and account links. The calculator does not read or change financial records. Presets save inputs separately; calculation results remain temporary.</p></section>`;
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
      const hadResult = state.result !== null,
        hadError = Boolean(state.error),
        updated = captureDraft();
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
        state.error = failure.message || 'The stock sale could not be calculated.';
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
