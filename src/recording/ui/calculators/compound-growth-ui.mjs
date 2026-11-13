import { calculateCompoundGrowth } from '../../calculators/compound-growth.mjs';
import { esc, money, parseMoney, tableHTML, bindPager } from '../shared-controls.mjs';
import { optionsHTML, createRootQuery, createDraftState } from './shared.mjs';

const PAGE_SIZE = 12;
const defaults = () => ({
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
const percent = (value) =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)}%`;
function termLabel(totalMonths) {
  const years = Math.floor(totalMonths / 12),
    months = totalMonths % 12;
  return `${totalMonths} months${years ? ` (${years} ${years === 1 ? 'year' : 'years'}${months ? `, ${months} ${months === 1 ? 'month' : 'months'}` : ''})` : ''}`;
}

function growthChart(report) {
  const maximum = report.endingBalanceCents;
  if (!maximum)
    return '<p class="recording-note compound-tool-zero">Projected balances remain $0.00 throughout this term.</p>';
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
    top = 16,
    bottom = 194,
    x = (month) => left + ((right - left) * month) / Math.max(1, report.totalMonths),
    y = (cents) => bottom - ((bottom - top) * cents) / maximum,
    point = (row, key) => `${x(row.month).toFixed(3)},${y(row[key]).toFixed(3)}`,
    capital = points.map((row) => point(row, 'capital')),
    ending = points.map((row) => point(row, 'balance')),
    ticks = [
      ...new Set([0, ...[1, 2, 3, 4].map((part) => Math.round((report.totalMonths * part) / 4))]),
    ];
  return `<div class="compound-tool-chart-scroll" role="region" aria-label="Compound growth chart" tabindex="0"><svg class="compound-tool-chart" viewBox="0 0 720 238" role="img" aria-labelledby="compound-tool-chart-title compound-tool-chart-description"><title id="compound-tool-chart-title">Contributed capital and projected growth</title><desc id="compound-tool-chart-description">The full ${report.totalMonths}-month term, from the starting deposit before regular contributions through every month-end balance. Exact rounded amounts are available in the schedule.</desc>${[
    0, 0.5, 1,
  ]
    .map((fraction) => {
      const value = Math.round(maximum * fraction),
        axisY = bottom - (bottom - top) * fraction;
      return `<line class="compound-tool-gridline" x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}"/><text class="compound-tool-axis" x="132" y="${axisY + 4}" text-anchor="end">${esc(money(value))}</text>`;
    })
    .join(
      '',
    )}<path class="compound-tool-capital-area" d="M${left},${bottom} L${capital.join(' L')} L${x(report.totalMonths)},${bottom} Z"/><path class="compound-tool-growth-area" d="M${ending.join(' L')} L${capital.slice().reverse().join(' L')} Z"/><polyline class="compound-tool-capital-line" points="${capital.join(' ')}"/><polyline class="compound-tool-ending-line" points="${ending.join(' ')}"/>${report.totalMonths ? '' : `<circle class="compound-tool-point" cx="${left}" cy="${y(report.initialCents)}" r="3"/>`}${ticks.map((month) => `<text class="compound-tool-axis" x="${x(month)}" y="216" text-anchor="middle">Month ${month}</text>`).join('')}</svg></div><div class="compound-tool-chart-key" aria-hidden="true"><span class="compound-tool-capital-key">Contributed capital</span><span class="compound-tool-growth-key">Growth</span></div><p class="recording-note">The chart covers the full term using month-end balances. The month 0 point is the starting deposit before any regular contribution.</p>`;
}

export function createCompoundGrowthUI({ root, isActive }) {
  const $ = createRootQuery(root);
  const pages = { monthly: { page: 1 }, yearly: { page: 1 } };
  const state = createDraftState(defaults);
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
    const keys = Object.keys(defaults()),
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
      Reflect.ownKeys(raw).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(raw, key))
    )
      throw new Error('Compound Growth preset inputs must contain exactly the supported fields.');
    for (const key of keys) {
      if (key === 'contributionsEnabled') {
        if (typeof raw[key] !== 'boolean')
          throw new Error('Preset contributionsEnabled must be a boolean.');
      } else if (typeof raw[key] !== 'string' || raw[key].length > 200) {
        throw new Error(`Preset ${key} must be text of at most 200 characters.`);
      } else if (choices[key] && !choices[key].includes(raw[key])) {
        throw new Error(`Preset ${key} is not a supported choice.`);
      }
    }
    if (
      raw.annualRate !== '' &&
      (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.annualRate) ||
        !Number.isFinite(Number(raw.annualRate)))
    )
      throw new Error('Preset annualRate must be blank or a finite number-input value.');
    for (const key of ['years', 'months'])
      if (!/^\d*$/.test(raw[key]))
        throw new Error(`Preset ${key} must be blank or an unsigned whole number.`);
    return Object.fromEntries(keys.map((key) => [key, raw[key]]));
  }
  function applyPreset(raw) {
    const next = validatePreset(raw);
    reset();
    state.draft = next;
    if (isActive?.() !== false) render();
  }
  function captureDraft() {
    if (!state.capture(readForm())) return false;
    pages.monthly.page = pages.yearly.page = 1;
    return true;
  }
  function readOptions() {
    const requiredAmount = (value, label) => {
      if (!value.trim()) throw new Error(`Enter ${label}; use 0 if the amount is zero.`);
      return parseMoney(value);
    };
    if (!state.draft.annualRate.trim())
      throw new Error('Enter an annual rate; use 0 for a zero-rate scenario.');
    if (!state.draft.years.trim() || !state.draft.months.trim())
      throw new Error('Enter whole years and months; use 0 for either part when needed.');
    return {
      initialCents: requiredAmount(state.draft.initial, 'a starting deposit'),
      annualRatePercent: Number(state.draft.annualRate),
      rateType: state.draft.rateType,
      compounding: state.draft.compounding,
      years: Number(state.draft.years),
      months: Number(state.draft.months),
      contributionsEnabled: state.draft.contributionsEnabled,
      ...(state.draft.contributionsEnabled
        ? {
            contributionCents: requiredAmount(state.draft.contribution, 'a contribution amount'),
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
      ? 'APY already includes compounding; the compounding frequency is ignored.'
      : 'Nominal rate is converted using the chosen compounding frequency.';
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
        ? `<p class="form-error compound-tool-error" id="calculator-error" role="alert" tabindex="-1">${esc(state.error)}</p>`
        : `<p class="recording-note compound-tool-prompt" role="status">${state.stale ? 'Inputs changed. Calculate again to update the results.' : 'Enter a starting deposit and annual rate, then choose Calculate.'}</p>`;
      return;
    }
    const rows = scheduleView === 'monthly' ? state.result.months : state.result.years;
    target.innerHTML = `<div class="summary-grid compound-tool-summary">${[
      ['Ending balance', 'endingBalanceCents', 'Projected balance at the end of the term'],
      ['Total contributed', 'totalContributedCents', 'Starting deposit plus regular contributions'],
      ['Projected growth', 'interestCents', 'Pre-tax growth at the fixed rate'],
    ]
      .map(
        ([label, key, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-calculator-total="${key}">${money(state.result[key])}</strong><span class="stat-caption">${caption}</span></div>`,
      )
      .join(
        '',
      )}</div><dl class="compound-tool-details"><div><dt>Starting deposit</dt><dd>${money(state.result.initialCents)}</dd></div><div><dt>Additional contributions</dt><dd>${money(state.result.additionalContributionsCents)}</dd></div><div><dt>Number of contributions</dt><dd>${state.result.contributionCount}</dd></div><div><dt>Normalized term</dt><dd>${termLabel(state.result.totalMonths)}</dd></div><div><dt>Effective annual yield</dt><dd>${esc(percent(state.result.effectiveAnnualYieldPercent))}</dd></div></dl><section class="recording-section"><div class="recording-table-heading"><h2>Contributed capital & growth</h2><span class="scope-note">Full term · USD</span></div>${growthChart(state.result)}</section><section class="recording-section"><div class="recording-table-heading"><h2>Growth schedule</h2><label class="compound-tool-schedule-control">Schedule detail<select id="calculator-schedule-view">${optionsHTML(
      [
        ['yearly', 'Yearly'],
        ['monthly', 'Monthly'],
      ],
      scheduleView,
    )}</select></label></div>${tableHTML(
      'compound-growth-schedule',
      [
        'Period',
        { label: 'Opening balance', align: 'end' },
        { label: 'Contributions', align: 'end' },
        { label: 'Growth', align: 'end' },
        { label: 'Ending balance', align: 'end' },
        { label: 'Deposits', align: 'end' },
      ],
      rows,
      (row) =>
        `<tr><td>${scheduleView === 'monthly' ? `Month ${row.month}` : `Year ${row.year} (${row.months} ${row.months === 1 ? 'month' : 'months'})`}</td><td class="amount">${money(row.openingBalanceCents)}</td><td class="amount">${money(row.contributionsCents)}</td><td class="amount">${money(row.interestCents)}</td><td class="amount">${money(row.endingBalanceCents)}</td><td class="numeric">${row.contributionCount}</td></tr>`,
      pages[scheduleView],
      PAGE_SIZE,
      'A zero-month term has no schedule periods or regular contributions.',
    )}</section><p class="recording-note">Amounts are displayed in rounded cents. Growth within the calculation is not rounded to cents each month; displayed period growth reconciles opening balance and contributions to ending balance.</p>`;
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
    );
  }
  function render() {
    if (!root || isActive?.() === false) return;
    const focused = root.contains((root.ownerDocument ?? document).activeElement)
        ? (root.ownerDocument ?? document).activeElement
        : null,
      focusId = focused?.id,
      selectionStart = focused?.selectionStart,
      selectionEnd = focused?.selectionEnd;
    state.beginRender(captureDraft);
    root.innerHTML = `<div class="compound-tool-heading"><p class="eyebrow">CALCULATORS · PRE-TAX</p><h1>Compound Growth</h1><p class="recording-note">Estimate growth at a fixed annual rate, with optional regular contributions. This scenario is independent of your recorded accounts.</p></div><form id="calculator-form" class="compound-tool-form"><div class="compound-tool-fields"><label>Starting deposit ($)<input id="calculator-initial" name="initial" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required value="${esc(state.draft.initial)}"></label><label>Annual rate (%)<input id="calculator-rate" name="annualRate" type="number" min="0" step="any" inputmode="decimal" required value="${esc(state.draft.annualRate)}" aria-describedby="calculator-rate-help"></label><label>Rate type<select id="calculator-rate-type" name="rateType">${optionsHTML(
      [
        ['nominal', 'Nominal annual rate'],
        ['apy', 'APY (effective annual yield)'],
      ],
      state.draft.rateType,
    )}</select></label><label>Compounding frequency<select id="calculator-compounding" name="compounding"${state.draft.rateType === 'apy' ? ' disabled' : ''}>${optionsHTML(frequencies, state.draft.compounding)}</select></label><label>Years<input id="calculator-years" name="years" type="number" min="0" step="1" inputmode="numeric" required value="${esc(state.draft.years)}" aria-describedby="calculator-term-help"></label><label>Months<input id="calculator-months" name="months" type="number" min="0" step="1" inputmode="numeric" required value="${esc(state.draft.months)}" aria-describedby="calculator-term-help"></label></div><p class="recording-note" id="calculator-rate-help"></p><p class="recording-note" id="calculator-term-help">Years and months combine into one term, up to 1,200 months. Zero amounts and a zero-month term are allowed.</p><label class="compound-tool-toggle"><input id="calculator-contributions-enabled" name="contributionsEnabled" type="checkbox" aria-controls="calculator-contribution-fields"${state.draft.contributionsEnabled ? ' checked' : ''}>Regular contributions <span>Optional</span></label><fieldset class="compound-tool-contributions" id="calculator-contribution-fields"${state.draft.contributionsEnabled ? '' : ' disabled'}><legend>Contribution details</legend><div class="compound-tool-fields"><label>Contribution amount ($)<input id="calculator-contribution" name="contribution" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(state.draft.contribution)}"${state.draft.contributionsEnabled ? ' required' : ' disabled'}></label><label>Contribution frequency<select id="calculator-contribution-frequency" name="contributionFrequency"${state.draft.contributionsEnabled ? '' : ' disabled'}>${optionsHTML(
      [
        ['monthly', 'Monthly'],
        ['quarterly', 'Quarterly'],
        ['annually', 'Annually'],
      ],
      state.draft.contributionFrequency,
    )}</select></label><label>Contribution timing<select id="calculator-timing" name="contributionTiming"${state.draft.contributionsEnabled ? '' : ' disabled'}>${optionsHTML(
      [
        ['end', 'End of period'],
        ['beginning', 'Beginning of period'],
      ],
      state.draft.contributionTiming,
    )}</select></label></div></fieldset><div class="compound-tool-actions"><button type="submit" class="button button-primary" id="calculator-calculate">Calculate</button><button type="button" class="button button-outline" id="calculator-reset">Reset calculator</button></div></form><div id="calculator-results"></div><section class="compound-tool-assumptions" aria-labelledby="compound-tool-assumptions-heading"><h2 id="compound-tool-assumptions-heading">Calculation assumptions</h2><p>A fixed nonnegative rate with growth reinvested. One month is 1/12 of a year; daily compounding uses 365 periods per year. Fractional compounding periods accrue between scheduled dates.</p><p>Contributions occur at the beginning or end of each chosen monthly, quarterly, or annual period. Beginning-of-period contributions start at month 0 and exclude the term's final boundary; end-of-period contributions start after one full period and include a matching final boundary.</p><p>Results are pre-tax and exclude fees, inflation, withdrawals, and changes in the rate. The calculator does not read or update financial records. Presets save inputs separately; calculation results remain temporary.</p></section>`;
    updateDisabled();
    const form = $('calculator-form');
    const changed = () => {
      const hadError = Boolean(state.error),
        hadResult = state.result !== null,
        updated = captureDraft();
      updateDisabled();
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
        state.error = failure.message || 'The growth scenario could not be calculated.';
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
    if (focusId) {
      const current = $(focusId);
      current?.focus();
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd))
        current?.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
  return { render, reset, capturePreset, validatePreset, applyPreset };
}
