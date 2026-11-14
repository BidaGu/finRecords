import {
  scopedPresentation,
  presetCurrency,
  currencyField,
  calculatorError,
  captureViewScroll,
  restoreViewScroll,
} from './shared.mjs';
import { calculateCompoundGrowth } from '../../calculators/compound-growth.mjs';
import { esc, parseMoney, tableHTML, bindPager } from '../shared-controls.mjs';
import { optionsHTML, createRootQuery, createDraftState } from './shared.mjs';

const PAGE_SIZE = 12;
const defaults = () => ({
  currency: 'USD',
  initial: '',
  annualRate: '',
  rateType: 'nominal',
  compounding: 'annually',
  years: '1',
  months: '0',
  contributionsEnabled: false,
  contribution: '',
  contributionFrequency: 'monthly',
  contributionTiming: 'end',
});
const frequencies = [
  ['annually', 'Annually'],
  ['semiannually', 'Semiannually'],
  ['quarterly', 'Quarterly'],
  ['monthly', 'Monthly'],
  ['daily', 'Daily (365 periods/year)'],
];
export function createCompoundGrowthUI({ root, isActive, getPresentation }) {
  const $ = createRootQuery(root);
  const pages = { monthly: { page: 1 }, yearly: { page: 1 } };
  const state = createDraftState(defaults);
  let currentPresentation;
  const presentation = (refresh = false) => {
    if (refresh || !currentPresentation || currentPresentation.currency !== state.draft.currency)
      currentPresentation = scopedPresentation(getPresentation, state.draft.currency);
    return currentPresentation;
  };
  const t = (...args) => presentation().t(...args),
    money = (value) => presentation().money(value),
    percent = (value) =>
      `${new Intl.NumberFormat(presentation().language === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 6 }).format(value)}%`;
  function termLabel(totalMonths) {
    const years = Math.floor(totalMonths / 12),
      months = totalMonths % 12;
    return t('calc.growth.term', '{months} months{detail}', {
      months: totalMonths,
      detail: years
        ? ` (${years} ${years === 1 ? t('calc.growth.001', 'year') : t('calc.growth.002', 'years')}${months ? `, ${months} ${months === 1 ? t('calc.growth.003', 'month') : t('calc.growth.004', 'months')}` : ''})`
        : '',
    });
  }

  function growthChart(report) {
    const maximum = report.endingBalanceCents;
    if (!maximum)
      return `<p class="recording-note compound-tool-zero">${t('calc.money.growthZero', 'Projected balances ({currency}) remain 0.00 throughout this term.', { currency: presentation().currency })}</p>`;
    let contributed = BigInt(report.initialCents);
    const points = [
      { month: 0, capital: report.initialCents, balance: report.initialCents },
      ...report.months.map((row) => {
        contributed += BigInt(row.contributionsCents);
        return { month: row.month, capital: Number(contributed), balance: row.endingBalanceCents };
      }),
    ];
    const left = 140,
      right = 700,
      top = 32,
      bottom = 194,
      x = (month) => left + ((right - left) * month) / Math.max(1, report.totalMonths),
      y = (cents) => bottom - ((bottom - top) * cents) / maximum,
      point = (row, key) => `${x(row.month).toFixed(3)},${y(row[key]).toFixed(3)}`,
      capital = points.map((row) => point(row, 'capital')),
      ending = points.map((row) => point(row, 'balance')),
      ticks = [
        ...new Set([0, ...[1, 2, 3, 4].map((part) => Math.round((report.totalMonths * part) / 4))]),
      ];
    return `<div class="compound-tool-chart-scroll" role="region" aria-label="${esc(presentation().currencyLabel(t('calc.growth.007', 'Compound growth chart')))}" tabindex="0"><svg class="compound-tool-chart" viewBox="0 0 720 238" role="img" aria-labelledby="compound-tool-chart-title compound-tool-chart-description"><title id="compound-tool-chart-title">${presentation().currencyLabel(t('calc.growth.008', 'Contributed capital and projected growth'))}</title><desc id="compound-tool-chart-description">${t('calc.growth.009', 'The full {p0}-month term, from the starting deposit before regular contributions through every month-end balance. Exact rounded amounts are available in the schedule.', { p0: report.totalMonths })} ${t('calc.money.chartUnits', 'All amounts are in {currency}.', { currency: presentation().currency })}</desc><text class="compound-tool-axis compound-tool-currency-axis" x="132" y="14" text-anchor="end">${esc(presentation().currencyLabel(t('calc.money.amount', 'Amount')))}</text>${[
      0, 0.5, 1,
    ]
      .map((fraction) => {
        const value = Math.round(maximum * fraction),
          axisY = bottom - (bottom - top) * fraction;
        return `<line class="compound-tool-gridline" x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}"/><text class="compound-tool-axis" x="132" y="${axisY + 4}" text-anchor="end">${esc(money(value))}</text>`;
      })
      .join(
        '',
      )}<path class="compound-tool-capital-area" d="M${left},${bottom} L${capital.join(' L')} L${x(report.totalMonths)},${bottom} Z"/><path class="compound-tool-growth-area" d="M${ending.join(' L')} L${capital.slice().reverse().join(' L')} Z"/><polyline class="compound-tool-capital-line" points="${capital.join(' ')}"/><polyline class="compound-tool-ending-line" points="${ending.join(' ')}"/>${report.totalMonths ? '' : `<circle class="compound-tool-point" cx="${left}" cy="${y(report.initialCents)}" r="3"/>`}${ticks.map((month) => `<text class="compound-tool-axis" x="${x(month)}" y="216" text-anchor="middle">${t('calc.growth.006', 'Month {p0}', { p0: month })}</text>`).join('')}</svg></div><div class="compound-tool-chart-key" aria-hidden="true"><span class="compound-tool-capital-key">${presentation().currencyLabel(t('calc.growth.010', 'Contributed capital'))}</span><span class="compound-tool-growth-key">${presentation().currencyLabel(t('calc.growth.011', 'Growth'))}</span></div><p class="recording-note">${t('calc.growth.012', 'The chart covers the full term using month-end balances. The month 0 point is the starting deposit before any regular contribution.')}</p>`;
  }

  let scheduleView = 'yearly',
    formNeedsRefresh = true;

  function reset() {
    state.reset();
    formNeedsRefresh = true;
    scheduleView = 'yearly';
    pages.monthly.page = pages.yearly.page = 1;
  }
  function readForm() {
    const form = $('calculator-form');
    if (!form || !root.contains(form)) return state.draft;
    const controls = form.elements;
    return {
      currency: controls.currency.value,
      initial: controls.initial.value,
      annualRate: controls.annualRate.value,
      rateType: controls.rateType.value,
      compounding: controls.compounding.value,
      years: controls.years.value,
      months: controls.months.value,
      contributionsEnabled: controls.contributionsEnabled.checked,
      contribution: controls.contribution.value,
      contributionFrequency: controls.contributionFrequency.value,
      contributionTiming: controls.contributionTiming.value,
    };
  }
  function capturePreset() {
    return { ...(formNeedsRefresh ? state.draft : readForm()) };
  }
  function validatePreset(raw) {
    const keys = Object.keys(defaults()).filter((key) => key !== 'currency'),
      choices = {
        rateType: ['nominal', 'apy'],
        compounding: frequencies.map(([id]) => id),
        contributionFrequency: ['monthly', 'quarterly', 'annually'],
        contributionTiming: ['end', 'beginning'],
      };
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Reflect.ownKeys(raw).length !== keys.length + Number(Object.hasOwn(raw, 'currency')) ||
      keys.some((key) => !Object.hasOwn(raw, key))
    )
      throw calculatorError(
        'calc.growth.013',
        'Compound Growth preset inputs must contain exactly the supported fields.',
      );
    const currency = presetCurrency(raw);
    for (const key of keys) {
      if (key === 'contributionsEnabled') {
        if (typeof raw[key] !== 'boolean')
          throw calculatorError(
            'calc.growth.014',
            'Preset contributionsEnabled must be a boolean.',
          );
      } else if (typeof raw[key] !== 'string' || raw[key].length > 200) {
        throw calculatorError(
          'calc.growth.015',
          'Preset {p0} must be text of at most 200 characters.',
          { p0: key },
        );
      } else if (choices[key] && !choices[key].includes(raw[key])) {
        throw calculatorError('calc.growth.016', 'Preset {p0} is not a supported choice.', {
          p0: key,
        });
      }
    }
    if (
      raw.annualRate !== '' &&
      (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.annualRate) ||
        !Number.isFinite(Number(raw.annualRate)))
    )
      throw calculatorError(
        'calc.growth.017',
        'Preset annualRate must be blank or a finite number-input value.',
      );
    for (const key of ['years', 'months'])
      if (!/^\d*$/.test(raw[key]))
        throw calculatorError(
          'calc.growth.020',
          'Preset {p0} must be blank or an unsigned whole number.',
          { p0: key },
        );
    return { ...currency, ...Object.fromEntries(keys.map((key) => [key, raw[key]])) };
  }
  function applyPreset(raw) {
    const next = validatePreset(raw);
    reset();
    state.draft = { ...defaults(), ...next };
    if (isActive?.() !== false) render();
  }
  function captureDraft() {
    if (!state.capture(readForm())) return false;
    pages.monthly.page = pages.yearly.page = 1;
    return true;
  }
  function readOptions() {
    const requiredAmount = (value, kind) => {
      if (!value.trim())
        throw calculatorError(
          'calc.growth.required.' + kind,
          kind === 'initial'
            ? 'Enter a starting deposit; use 0 if the amount is zero.'
            : 'Enter a contribution amount; use 0 if the amount is zero.',
        );
      return parseMoney(value);
    };
    if (!state.draft.annualRate.trim())
      throw calculatorError(
        'calc.growth.022',
        'Enter an annual rate; use 0 for a zero-rate scenario.',
      );
    if (!state.draft.years.trim() || !state.draft.months.trim())
      throw calculatorError(
        'calc.growth.023',
        'Enter whole years and months; use 0 for either part when needed.',
      );
    return {
      initialCents: requiredAmount(state.draft.initial, 'initial'),
      annualRatePercent: Number(state.draft.annualRate),
      rateType: state.draft.rateType,
      compounding: state.draft.compounding,
      years: Number(state.draft.years),
      months: Number(state.draft.months),
      contributionsEnabled: state.draft.contributionsEnabled,
      ...(state.draft.contributionsEnabled
        ? {
            contributionCents: requiredAmount(state.draft.contribution, 'contribution'),
            contributionFrequency: state.draft.contributionFrequency,
            contributionTiming: state.draft.contributionTiming,
          }
        : {}),
    };
  }
  function updateDisabled() {
    const apy = state.draft.rateType === 'apy',
      enabled = state.draft.contributionsEnabled;
    $('calculator-compounding').disabled = apy;
    $('calculator-rate-help').textContent = apy
      ? t(
          'calc.growth.026',
          'APY already includes compounding; the compounding frequency is ignored.',
        )
      : t('calc.growth.027', 'Nominal rate is converted using the chosen compounding frequency.');
    $('calculator-contribution-fields').disabled = !enabled;
    for (const id of [
      'calculator-contribution',
      'calculator-contribution-frequency',
      'calculator-timing',
    ])
      $(id).disabled = !enabled;
    $('calculator-contribution').required = enabled;
  }
  function renderResults() {
    const target = $('calculator-results');
    if (!target) return;
    if (!state.result) {
      target.innerHTML = state.error
        ? `<p class="form-error compound-tool-error" id="calculator-error" role="alert" tabindex="-1">${esc(presentation().error(state.error))}</p>`
        : `<p class="recording-note compound-tool-prompt" role="status">${state.stale ? t('calc.growth.028', 'Inputs changed. Calculate again to update the results.') : t('calc.growth.029', 'Enter a starting deposit and annual rate, then choose Calculate.')}</p>`;
      return;
    }
    const rows = scheduleView === 'monthly' ? state.result.months : state.result.years;
    target.innerHTML = `<div class="summary-grid compound-tool-summary">${[
      [
        presentation().currencyLabel(t('calc.growth.030', 'Ending balance')),
        'endingBalanceCents',
        t('calc.growth.031', 'Projected balance at the end of the term'),
      ],
      [
        presentation().currencyLabel(t('calc.growth.032', 'Total contributed')),
        'totalContributedCents',
        t('calc.growth.033', 'Starting deposit plus regular contributions'),
      ],
      [
        presentation().currencyLabel(t('calc.growth.034', 'Projected growth')),
        'interestCents',
        t('calc.growth.035', 'Pre-tax growth at the fixed rate'),
      ],
    ]
      .map(
        ([label, key, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-calculator-total="${key}">${money(state.result[key])}</strong><span class="stat-caption">${caption}</span></div>`,
      )
      .join(
        '',
      )}</div><dl class="compound-tool-details"><div><dt>${presentation().currencyLabel(t('calc.growth.049', 'Starting deposit'))}</dt><dd>${money(state.result.initialCents)}</dd></div><div><dt>${presentation().currencyLabel(t('calc.growth.050', 'Additional contributions'))}</dt><dd>${money(state.result.additionalContributionsCents)}</dd></div><div><dt>${t('calc.growth.051', 'Number of contributions')}</dt><dd>${state.result.contributionCount}</dd></div><div><dt>${t('calc.growth.052', 'Normalized term')}</dt><dd>${termLabel(state.result.totalMonths)}</dd></div><div><dt>${t('calc.growth.053', 'Effective annual yield')}</dt><dd>${esc(percent(state.result.effectiveAnnualYieldPercent))}</dd></div></dl><section class="recording-section"><div class="recording-table-heading"><h2>${presentation().currencyLabel(t('calc.growth.054', 'Contributed capital & growth'))}</h2><span class="scope-note">${t('calc.growth.055', 'Full term · {currency}', { currency: presentation().currency })}</span></div>${growthChart(state.result)}</section><section class="recording-section"><div class="recording-table-heading"><h2>${presentation().currencyLabel(t('calc.growth.056', 'Growth schedule'))}</h2><label class="compound-tool-schedule-control">${t('calc.growth.057', 'Schedule detail')}<select id="calculator-schedule-view">${optionsHTML(
      [
        ['yearly', t('calc.growth.036', 'Yearly')],
        ['monthly', t('calc.growth.037', 'Monthly')],
      ],
      scheduleView,
    )}</select></label></div>${tableHTML(
      'compound-growth-schedule',
      [
        t('calc.growth.038', 'Period'),
        { label: t('calc.growth.039', 'Opening balance'), align: 'end', monetary: true },
        { label: t('calc.growth.040', 'Contributions'), align: 'end', monetary: true },
        { label: t('calc.growth.041', 'Growth'), align: 'end', monetary: true },
        { label: t('calc.growth.042', 'Ending balance'), align: 'end', monetary: true },
        { label: t('calc.growth.043', 'Deposits'), align: 'end' },
      ],
      rows,
      (row) =>
        `<tr><td>${scheduleView === 'monthly' ? t('calc.growth.044', 'Month {p0}', { p0: row.month }) : t('calc.growth.047', 'Year {p0} ({p1} {p2})', { p0: row.year, p1: row.months, p2: row.months === 1 ? t('calc.growth.045', 'month') : t('calc.growth.046', 'months') })}</td><td class="amount">${money(row.openingBalanceCents)}</td><td class="amount">${money(row.contributionsCents)}</td><td class="amount">${money(row.interestCents)}</td><td class="amount">${money(row.endingBalanceCents)}</td><td class="numeric">${row.contributionCount}</td></tr>`,
      pages[scheduleView],
      PAGE_SIZE,
      t('calc.growth.048', 'A zero-month term has no schedule periods or regular contributions.'),
      presentation(),
    )}</section><p class="recording-note">${t('calc.growth.058', 'Amounts are displayed in rounded cents. Growth within the calculation is not rounded to cents each month; displayed period growth reconciles opening balance and contributions to ending balance.')}</p>`;
    $('calculator-schedule-view').addEventListener('change', () => {
      scheduleView = $('calculator-schedule-view').value;
      renderResults();
      $('calculator-schedule-view')?.focus();
    });
    bindPager(
      target,
      'compound-growth-schedule',
      rows.length,
      pages[scheduleView],
      PAGE_SIZE,
      renderResults,
      presentation(),
    );
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
    root.innerHTML = `<div class="compound-tool-heading"><p class="eyebrow">${t('calc.growth.066', 'CALCULATORS · PRE-TAX')}</p><h1>${t('calc.growth.067', 'Compound Growth')}</h1><p class="recording-note">${t('calc.growth.068', 'Estimate growth at a fixed annual rate, with optional regular contributions. This scenario is independent of your recorded accounts.')}</p></div><form id="calculator-form" class="compound-tool-form">${currencyField(presentation(), 'calculator-currency')}<div class="compound-tool-fields"><label>${t('calc.growth.069', 'Starting deposit ({unit})', { unit: presentation().currency })}<input id="calculator-initial" name="initial" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.initial)}"></label><label>${t('calc.growth.070', 'Annual rate (%)')}<input id="calculator-rate" name="annualRate" type="number" min="0" step="any" inputmode="decimal" required value="${esc(state.draft.annualRate)}" aria-describedby="calculator-rate-help"></label><label>${t('calc.growth.071', 'Rate type')}<select id="calculator-rate-type" name="rateType">${optionsHTML(
      [
        ['nominal', t('calc.growth.059', 'Nominal annual rate')],
        ['apy', t('calc.growth.060', 'APY (effective annual yield)')],
      ],
      state.draft.rateType,
    )}</select></label><label>${t('calc.growth.072', 'Compounding frequency')}<select id="calculator-compounding" name="compounding"${state.draft.rateType === 'apy' ? ' disabled' : ''}>${optionsHTML(
      frequencies.map(([id, label]) => [id, t('calc.growth.frequency.' + id, label)]),
      state.draft.compounding,
    )}</select></label><label>${t('calc.growth.073', 'Years')}<input id="calculator-years" name="years" type="number" min="0" step="1" inputmode="numeric" required value="${esc(state.draft.years)}" aria-describedby="calculator-term-help"></label><label>${t('calc.growth.074', 'Months')}<input id="calculator-months" name="months" type="number" min="0" step="1" inputmode="numeric" required value="${esc(state.draft.months)}" aria-describedby="calculator-term-help"></label></div><p class="recording-note" id="calculator-rate-help"></p><p class="recording-note" id="calculator-term-help">${t('calc.growth.075', 'Years and months combine into one term, up to 1,200 months. Zero amounts and a zero-month term are allowed.')}</p><label class="compound-tool-toggle"><input id="calculator-contributions-enabled" name="contributionsEnabled" type="checkbox" aria-controls="calculator-contribution-fields"${state.draft.contributionsEnabled ? ' checked' : ''}>${t('calc.growth.076', 'Regular contributions')} <span>${t('calc.growth.077', 'Optional')}</span></label><fieldset class="compound-tool-contributions" id="calculator-contribution-fields"${state.draft.contributionsEnabled ? '' : ' disabled'}><legend>${t('calc.growth.078', 'Contribution details')}</legend><div class="compound-tool-fields"><label>${t('calc.growth.079', 'Contribution amount ({unit})', { unit: presentation().currency })}<input id="calculator-contribution" name="contribution" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(state.draft.contribution)}"${state.draft.contributionsEnabled ? ' required' : ' disabled'}></label><label>${t('calc.growth.080', 'Contribution frequency')}<select id="calculator-contribution-frequency" name="contributionFrequency"${state.draft.contributionsEnabled ? '' : ' disabled'}>${optionsHTML(
      [
        ['monthly', t('calc.growth.061', 'Monthly')],
        ['quarterly', t('calc.growth.062', 'Quarterly')],
        ['annually', t('calc.growth.063', 'Annually')],
      ],
      state.draft.contributionFrequency,
    )}</select></label><label>${t('calc.growth.081', 'Contribution timing')}<select id="calculator-timing" name="contributionTiming"${state.draft.contributionsEnabled ? '' : ' disabled'}>${optionsHTML(
      [
        ['end', t('calc.growth.064', 'End of period')],
        ['beginning', t('calc.growth.065', 'Beginning of period')],
      ],
      state.draft.contributionTiming,
    )}</select></label></div></fieldset><div class="compound-tool-actions"><button type="submit" class="button button-primary" id="calculator-calculate">${t('calc.growth.082', 'Calculate')}</button><button type="button" class="button button-outline" id="calculator-reset">${t('calc.growth.083', 'Reset calculator')}</button></div></form><div id="calculator-results"></div><section class="compound-tool-assumptions" aria-labelledby="compound-tool-assumptions-heading"><h2 id="compound-tool-assumptions-heading">${t('calc.growth.084', 'Calculation assumptions')}</h2><p>${t('calc.growth.085', 'A fixed nonnegative rate with growth reinvested. One month is 1/12 of a year; daily compounding uses 365 periods per year. Fractional compounding periods accrue between scheduled dates.')}</p><p>${t('calc.growth.086', "Contributions occur at the beginning or end of each chosen monthly, quarterly, or annual period. Beginning-of-period contributions start at month 0 and exclude the term's final boundary; end-of-period contributions start after one full period and include a matching final boundary.")}</p><p>${t('calc.growth.087', 'Results are pre-tax and exclude fees, inflation, withdrawals, and changes in the rate. The calculator does not read or update financial records. Presets save inputs separately; calculation results remain temporary.')}</p></section>`;
    updateDisabled();
    const form = $('calculator-form');
    const changed = () => {
      const previousCurrency = state.draft.currency,
        hadError = Boolean(state.error),
        hadResult = state.result !== null,
        updated = captureDraft();
      updateDisabled();
      if (previousCurrency !== state.draft.currency) {
        render();
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
      pages.monthly.page = pages.yearly.page = 1;
      try {
        state.result = calculateCompoundGrowth(readOptions());
      } catch (failure) {
        state.error = failure?.message
          ? failure
          : calculatorError('calc.growth.088', 'The growth scenario could not be calculated.');
      }
      renderResults();
      if (state.error) $('calculator-error')?.focus();
    });
    $('calculator-reset').addEventListener('click', () => {
      reset();
      render();
      $('calculator-initial')?.focus();
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
