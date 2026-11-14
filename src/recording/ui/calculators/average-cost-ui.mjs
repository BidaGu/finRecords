import {
  scopedPresentation,
  presetCurrency,
  currencyField,
  calculatorError,
  captureViewScroll,
  restoreViewScroll,
} from './shared.mjs';
import {
  calculateTargetAverageCost,
  calculateAverageAfterPurchase,
} from '../../calculators/average-cost.mjs';
import { esc } from '../shared-controls.mjs';
import { optionsHTML, createRootQuery, createDraftState } from './shared.mjs';

const targetCostDefaults = () => ({
  currency: 'USD',
  mode: 'target',
  currentShares: '',
  currentAveragePrice: '',
  purchasePrice: '',
  targetAveragePrice: '',
  additionalShares: '',
  shareMode: 'whole',
  fractionalIncrement: '0.000001',
});
export function createAverageCostUI({ root, isActive, getPresentation }) {
  const $ = createRootQuery(root);
  const state = createDraftState(targetCostDefaults);
  let currentPresentation;
  const presentation = (refresh = false) => {
    if (refresh || !currentPresentation || currentPresentation.currency !== state.draft.currency)
      currentPresentation = scopedPresentation(getPresentation, state.draft.currency);
    return currentPresentation;
  };
  const t = (...args) => presentation().t(...args),
    money = (value) => presentation().money(value),
    targetDecimal = (value, monetary = false) => presentation().decimal(value, monetary);
  function targetAverageLabel(result) {
    if (result.actualAveragePrice === null) return '—';
    if (result.actualAveragePriceApproximate && /^0(?:\.0+)?$/.test(result.actualAveragePrice))
      return t('calc.money.averageTiny', 'Less than 0.00000001');
    return `${result.actualAveragePriceApproximate ? '≈ ' : ''}${targetDecimal(result.actualAveragePrice, true)}`;
  }
  function targetTheoreticalLabel(value) {
    if (!value) return '—';
    if (value.approximate && /^0(?:\.0+)?$/.test(value.decimal))
      return t('calc.average.002', 'Less than 0.000000000001');
    return `${value.approximate ? '≈ ' : ''}${targetDecimal(value.decimal)}`;
  }

  let formNeedsRefresh = true;
  function reset() {
    state.reset();
    formNeedsRefresh = true;
  }
  function readForm() {
    const form = $('target-cost-form');
    if (!form || !root.contains(form)) return state.draft;
    const controls = form.elements;
    return Object.fromEntries(Object.keys(state.draft).map((key) => [key, controls[key].value]));
  }
  function capturePreset() {
    return { ...(formNeedsRefresh ? state.draft : readForm()) };
  }
  function validatePreset(raw) {
    const keys = Object.keys(targetCostDefaults()).filter((key) => key !== 'currency'),
      choices = {
        mode: ['target', 'purchase'],
        shareMode: ['whole', 'fractional'],
        fractionalIncrement: [
          '0.1',
          '0.01',
          '0.001',
          '0.0001',
          '0.00001',
          '0.000001',
          '0.0000001',
          '0.00000001',
        ],
      };
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Reflect.ownKeys(raw).length !== keys.length + Number(Object.hasOwn(raw, 'currency')) ||
      keys.some((key) => !Object.hasOwn(raw, key))
    )
      throw calculatorError(
        'calc.average.003',
        'Average Cost preset inputs must contain exactly the supported fields.',
      );
    const currency = presetCurrency(raw);
    for (const key of keys) {
      if (typeof raw[key] !== 'string' || raw[key].length > 200)
        throw calculatorError(
          'calc.average.004',
          'Preset {p0} must be text of at most 200 characters.',
          { p0: key },
        );
      if (choices[key] && !choices[key].includes(raw[key]))
        throw calculatorError('calc.average.005', 'Preset {p0} is not a supported choice.', {
          p0: key,
        });
    }
    return { ...currency, ...Object.fromEntries(keys.map((key) => [key, raw[key]])) };
  }
  function applyPreset(raw) {
    const next = validatePreset(raw);
    reset();
    state.draft = { ...targetCostDefaults(), ...next };
    if (isActive?.() !== false) render();
  }
  function captureDraft() {
    return state.capture(readForm());
  }
  function syncModeFields() {
    const purchaseMode = state.draft.mode === 'purchase';
    for (const [labelId, controlId] of [
      ['average-cost-target-field', 'target-cost-target-average'],
      ['average-cost-share-mode-field', 'target-cost-share-mode'],
      ['average-cost-increment-field', 'target-cost-increment'],
    ]) {
      $(labelId).hidden = purchaseMode;
      $(controlId).disabled = purchaseMode;
    }
    $('target-cost-target-average').required = !purchaseMode;
    $('target-cost-increment').disabled = purchaseMode || state.draft.shareMode === 'whole';
    $('average-cost-purchase-field').hidden = !purchaseMode;
    $('average-cost-additional-shares').disabled = !purchaseMode;
    $('average-cost-additional-shares').required = purchaseMode;
    $('average-cost-target-help').hidden = purchaseMode;
    $('average-cost-purchase-help').hidden = !purchaseMode;
  }
  function roundingNote() {
    return state.result.roundingDifferenceCents
      ? `<p class="recording-note"><strong>${presentation().currencyLabel(t('calc.money.averageRounding', 'Rounding difference'))}:</strong> ${t('calc.average.006', 'Independent cent rounding leaves a {p0} display difference between total cost basis and the sum of current cost basis plus additional cash. The weighted average uses unrounded costs.', { p0: money(state.result.roundingDifferenceCents) })}</p>`
      : '';
  }
  function renderResults() {
    const target = $('target-cost-results');
    if (!target) return;
    if (!state.result) {
      target.innerHTML = state.error
        ? `<p class="form-error compound-tool-error" id="target-cost-error" role="alert" tabindex="-1">${esc(presentation().error(state.error))}</p>`
        : `<p class="recording-note compound-tool-prompt" role="status">${state.stale ? t('calc.average.007', 'Inputs changed. Calculate again to update the results.') : state.draft.mode === 'purchase' ? t('calc.average.008', 'Enter the current shares, two prices, and additional shares to buy, then choose Calculate.') : t('calc.average.009', 'Enter the share quantity and three prices, then choose Calculate.')}</p>`;
      return;
    }
    if (state.draft.mode === 'purchase') {
      const status =
        state.result.direction === 'none'
          ? t('calc.average.010', 'The average cost is unchanged.')
          : state.result.direction === 'down'
            ? t('calc.average.011', 'Averaging down: the purchase lowers the average cost.')
            : t('calc.average.012', 'Averaging up: the purchase raises the average cost.');
      target.innerHTML = `<p class="recording-note target-cost-status" role="status">${esc(status)}</p><div class="summary-grid target-cost-summary">${[
        [
          presentation().currencyLabel(t('calc.average.013', 'Resulting average cost')),
          'actualAveragePrice',
          targetAverageLabel(state.result),
          t('calc.average.014', 'Weighted average cost per share'),
        ],
        [
          presentation().currencyLabel(t('calc.average.015', 'Additional cash')),
          'purchaseCostCents',
          money(state.result.purchaseCostCents),
          t('calc.average.016', 'Purchase cost rounded to cents'),
        ],
        [
          t('calc.average.017', 'Total shares'),
          'totalShares',
          targetDecimal(state.result.totalShares),
          t('calc.average.018', 'Current shares plus additional shares'),
        ],
      ]
        .map(
          ([label, key, value, caption]) =>
            `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-target-cost-value="${key}">${esc(value)}</strong><span class="stat-caption">${caption}</span></div>`,
        )
        .join(
          '',
        )}</div><dl class="compound-tool-details"><div><dt>${t('calc.average.019', 'Additional shares')}</dt><dd data-target-cost-value="additionalShares">${esc(targetDecimal(state.result.additionalShares))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.020', 'Current average cost per share'))}</dt><dd>${esc(targetDecimal(state.result.inputs.currentAveragePrice, true))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.021', 'Current cost basis'))}</dt><dd>${money(state.result.currentCostCents)}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.022', 'Total cost basis'))}</dt><dd>${money(state.result.totalCostCents)}</dd></div></dl><p class="recording-note">${t('calc.average.023', 'The entered additional quantity is used exactly, without share-increment rounding. The resulting average is marked approximately when its displayed decimal is rounded.')}</p>${roundingNote()}`;
      return;
    }
    if (state.result.status === 'unreachable') {
      target.innerHTML = `<p class="recording-note target-cost-status" role="status"><strong>${t('calc.average.024', 'The target cannot be reached with this fixed purchase price.')}</strong> ${esc(presentation().error({ code: state.result.reasonCode, message: state.result.reason, params: state.result.reasonParams }))}</p><dl class="compound-tool-details"><div><dt>${presentation().currencyLabel(t('calc.average.025', 'Current cost basis'))}</dt><dd>${money(state.result.currentCostCents)}</dd></div><div><dt>${t('calc.average.026', 'Current shares')}</dt><dd>${esc(targetDecimal(state.result.inputs.currentShares))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.027', 'Target average cost'))}</dt><dd>${esc(targetDecimal(state.result.inputs.targetAveragePrice, true))}</dd></div></dl>`;
      return;
    }
    const alreadyMet = state.result.status === 'already-met',
      direction =
        state.result.direction === 'down'
          ? t('calc.average.028', 'Averaging down')
          : t('calc.average.029', 'Averaging up'),
      status = alreadyMet
        ? t(
            'calc.average.030',
            'The current average already equals the target. No additional purchase is needed.',
          )
        : `${direction}: ${state.result.exactTarget ? t('calc.average.031', 'the target is reached exactly.') : t('calc.average.032', 'the target is crossed at the selected share increment.')}`;
    target.innerHTML = `<p class="recording-note target-cost-status" role="status">${esc(status)}</p><div class="summary-grid target-cost-summary">${[
      [
        t('calc.average.033', 'Additional shares'),
        'additionalShares',
        targetDecimal(state.result.additionalShares),
        t('calc.average.034', 'Quantity required at the chosen increment'),
      ],
      [
        presentation().currencyLabel(t('calc.average.035', 'Additional cash')),
        'purchaseCostCents',
        money(state.result.purchaseCostCents),
        t('calc.average.036', 'Purchase cost rounded to cents'),
      ],
      [
        presentation().currencyLabel(t('calc.average.037', 'Resulting average cost')),
        'actualAveragePrice',
        targetAverageLabel(state.result),
        t('calc.average.038', 'Weighted average cost per share'),
      ],
    ]
      .map(
        ([label, key, value, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-target-cost-value="${key}">${esc(value)}</strong><span class="stat-caption">${caption}</span></div>`,
      )
      .join(
        '',
      )}</div><dl class="compound-tool-details"><div><dt>${t('calc.average.042', 'Total shares')}</dt><dd data-target-cost-value="totalShares">${esc(targetDecimal(state.result.totalShares))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.043', 'Current cost basis'))}</dt><dd>${money(state.result.currentCostCents)}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.044', 'Total cost basis'))}</dt><dd>${money(state.result.totalCostCents)}</dd></div><div><dt>${t('calc.average.045', 'Theoretical additional shares')}</dt><dd>${esc(targetTheoreticalLabel(state.result.theoreticalAdditionalShares))}</dd></div><div><dt>${presentation().currencyLabel(t('calc.average.046', 'Target average cost'))}</dt><dd>${esc(targetDecimal(state.result.inputs.targetAveragePrice, true))}</dd></div><div><dt>${t('calc.average.047', 'Purchase share increment')}</dt><dd>${esc(targetDecimal(state.result.shareIncrement))}</dd></div></dl><p class="recording-note">${t('calc.average.048', '{p0} Theoretical quantity and resulting average are marked approximately when their displayed decimal is rounded.', { p0: alreadyMet ? t('calc.average.039', 'No purchase is required for an already-met target.') : state.result.exactAttainable ? t('calc.average.040', 'The exact target quantity aligns with the selected share increment.') : t('calc.average.041', 'The exact target quantity does not align with the selected increment; the purchase quantity is rounded up to reach or cross the target.') })}</p>${roundingNote()}`;
  }
  function render() {
    if (!root || isActive?.() === false) return;
    const savedScroll = formNeedsRefresh ? null : captureViewScroll(root);
    const focused = root.contains((root.ownerDocument ?? document).activeElement)
        ? (root.ownerDocument ?? document).activeElement
        : null,
      focusId = focused?.id,
      selectionStart = focused?.selectionStart,
      selectionEnd = focused?.selectionEnd;
    state.beginRender(captureDraft);
    presentation(true);
    root.innerHTML = `<div class="compound-tool-heading target-cost-heading"><p class="eyebrow">${t('calc.average.053', 'CALCULATORS · WEIGHTED AVERAGE')}</p><h1>${t('calc.average.054', 'Average Cost')}</h1><p class="recording-note">${t('calc.average.055', 'Find the additional shares needed to reach a chosen average cost, or the resulting average after buying a specified quantity. Both scenarios use one fixed purchase price and are independent of recorded accounts.')}</p></div><form id="target-cost-form" class="compound-tool-form">${currencyField(presentation(), 'average-cost-currency')}<label class="compound-tool-schedule-control average-cost-mode">${t('calc.average.056', 'Calculation')}<select id="average-cost-mode" name="mode">${optionsHTML(
      [
        ['target', t('calc.average.049', 'Find shares to buy')],
        ['purchase', t('calc.average.050', 'Find resulting average')],
      ],
      state.draft.mode,
    )}</select></label><div class="compound-tool-fields"><label>${t('calc.average.057', 'Current shares')}<input id="target-cost-shares" name="currentShares" type="text" inputmode="decimal" autocomplete="off" placeholder="0" required value="${esc(state.draft.currentShares)}"></label><label>${t('calc.average.058', 'Current average cost per share ({unit})', { unit: presentation().currency })}<input id="target-cost-current-average" name="currentAveragePrice" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.currentAveragePrice)}"></label><label>${t('calc.average.059', 'Purchase price per share ({unit})', { unit: presentation().currency })}<input id="target-cost-purchase-price" name="purchasePrice" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.purchasePrice)}"></label><label id="average-cost-target-field">${t('calc.average.060', 'Target average cost per share ({unit})', { unit: presentation().currency })}<input id="target-cost-target-average" name="targetAveragePrice" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.targetAveragePrice)}"></label><label id="average-cost-share-mode-field">${t('calc.average.061', 'Additional share mode')}<select id="target-cost-share-mode" name="shareMode">${optionsHTML(
      [
        ['whole', t('calc.average.051', 'Whole shares')],
        ['fractional', t('calc.average.052', 'Fractional shares')],
      ],
      state.draft.shareMode,
    )}</select></label><label id="average-cost-increment-field">${t('calc.average.062', 'Fractional increment')}<select id="target-cost-increment" name="fractionalIncrement"${state.draft.shareMode === 'whole' ? ' disabled' : ''}>${optionsHTML(
      ['0.1', '0.01', '0.001', '0.0001', '0.00001', '0.000001', '0.0000001', '0.00000001'].map(
        (step) => [step, step],
      ),
      state.draft.fractionalIncrement,
    )}</select></label><label id="average-cost-purchase-field">${t('calc.average.063', 'Additional shares to buy')}<input id="average-cost-additional-shares" name="additionalShares" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(state.draft.additionalShares)}"></label></div><p class="recording-note">${t('calc.average.064', 'Share quantities accept up to 8 decimal places; each price accepts up to 6. Current shares and purchase price must be greater than zero; current average cost may be zero.')}</p><p class="recording-note" id="average-cost-target-help">${t('calc.average.065', 'Target average cost may be zero. Whole-share mode rounds only the additional purchase to whole shares and ignores the fractional increment.')}</p><p class="recording-note" id="average-cost-purchase-help">${t('calc.average.066', 'Additional shares may be zero. The entered quantity is used exactly without whole-share or fractional-increment rounding.')}</p><div class="compound-tool-actions"><button type="submit" class="button button-primary" id="target-cost-calculate">${t('calc.average.067', 'Calculate')}</button><button type="button" class="button button-outline" id="target-cost-reset">${t('calc.average.068', 'Reset calculator')}</button></div></form><div id="target-cost-results"></div><section class="compound-tool-assumptions" aria-labelledby="target-cost-assumptions-heading"><h2 id="target-cost-assumptions-heading">${t('calc.average.069', 'Calculation assumptions')}</h2><p>${t('calc.average.070', 'One additional purchase at a fixed price, with no sales, fees, or taxes. Cost basis is modeled as shares multiplied by the entered average cost. Use a precise current average; a rounded input changes the estimate.')}</p><p>${t('calc.average.071', 'Share quantities and target comparisons use exact decimal inputs. Displayed cost totals are independently rounded to cents, and averages may show rounded decimal previews. The calculator does not read or change financial records. Presets save inputs separately; calculation results remain temporary.')}</p></section>`;
    const form = $('target-cost-form');
    syncModeFields();
    const changed = () => {
      const hadResult = state.result !== null,
        hadError = Boolean(state.error),
        previousMode = state.draft.mode,
        previousCurrency = state.draft.currency,
        updated = captureDraft();
      syncModeFields();
      if (previousCurrency !== state.draft.currency) {
        render();
        return;
      }
      if (previousMode !== state.draft.mode) state.stale = false;
      if (updated && (hadResult || hadError || previousMode !== state.draft.mode)) renderResults();
    };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.draft = readForm();
      state.result = null;
      state.error = '';
      state.stale = false;
      try {
        const common = {
          currentShares: state.draft.currentShares,
          currentAveragePrice: state.draft.currentAveragePrice,
          purchasePrice: state.draft.purchasePrice,
        };
        state.result =
          state.draft.mode === 'purchase'
            ? calculateAverageAfterPurchase({
                ...common,
                additionalShares: state.draft.additionalShares,
              })
            : calculateTargetAverageCost({
                ...common,
                targetAveragePrice: state.draft.targetAveragePrice,
                shareMode: state.draft.shareMode,
                ...(state.draft.shareMode === 'whole'
                  ? {}
                  : { fractionalIncrement: state.draft.fractionalIncrement }),
              });
      } catch (failure) {
        state.error = failure?.message
          ? failure
          : calculatorError('calc.average.072', 'The average cost could not be calculated.');
      }
      renderResults();
      if (state.error) $('target-cost-error')?.focus();
    });
    $('target-cost-reset').addEventListener('click', () => {
      reset();
      render();
      $('target-cost-shares')?.focus();
    });
    renderResults();
    formNeedsRefresh = false;
    restoreViewScroll(root, savedScroll);
    if (focusId) {
      const current = $(focusId);
      current?.focus({ preventScroll: true });
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd))
        current?.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
  return { render, reset, capturePreset, validatePreset, applyPreset };
}
