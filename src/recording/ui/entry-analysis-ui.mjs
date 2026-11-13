import { analyzeEntries } from '../analysis/entry-analysis.mjs';
import { $, esc, money, tableHTML, bindPager } from './shared-controls.mjs';

const MONTH_PAGE_SIZE = 12;
const CATEGORY_PAGE_SIZE = 10;
const CHART_MONTHS = 24;
const percent = (share) =>
  share === null ? '—' : share > 0 && share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;

function summaryHTML(report = null) {
  return `<div class="summary-grid entry-analysis-summary">${[
    ['Total income', report?.gainsCents, 'Selected Gain entries'],
    ['Total expenses', report?.expensesCents, 'Selected Expense entries'],
    ['Net income', report?.netCents, 'Income minus expenses'],
  ]
    .map(
      ([label, value, caption], index) =>
        `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value${index === 0 ? ' gains-value' : ''}" data-analysis-total="${['income', 'expenses', 'net'][index]}">${value === undefined ? '—' : money(value)}</strong><span class="stat-caption">${report ? caption : 'Correct the activity-date range'}</span></div>`,
    )
    .join('')}</div>`;
}

const chartMaximum = (report) =>
  Math.max(0, ...report.months.flatMap((row) => [row.gainsCents, row.expensesCents]));
const chartLevels = (maximum) => (maximum ? [0, 0.5, 1] : [0]);

function monthlyPlot(report, viewportWidth) {
  const rows = report.months,
    visible = Math.min(CHART_MONTHS, rows.length),
    step = viewportWidth / visible,
    width = step * rows.length,
    maximum = chartMaximum(report),
    top = 16,
    bottom = 188,
    bar = Math.min(22, step * 0.35),
    gap = Math.min(2, step * 0.06),
    scale = maximum ? (bottom - top) / maximum : 0,
    labelStep = Math.max(1, Math.ceil(58 / step));
  return `<svg class="entry-analysis-chart" width="${width}" height="232" viewBox="0 0 ${width} 232" data-window-months="${visible}" data-month-count="${rows.length}" data-slot-width="${step}" role="img" aria-labelledby="entry-monthly-chart-title entry-monthly-chart-description"><title id="entry-monthly-chart-title">Monthly income and expenses</title><desc id="entry-monthly-chart-description">Paired bars show recorded income and expenses for every month from ${esc(rows[0].month)} through ${esc(rows.at(-1).month)}. ${rows.length > CHART_MONTHS ? 'Scroll horizontally through a 24-month window to review the full range. ' : ''}Exact amounts, including net income, appear in the monthly table.</desc>${chartLevels(
    maximum,
  )
    .map((fraction) => {
      const y = bottom - fraction * (bottom - top);
      return `<line class="entry-analysis-gridline" x1="0" x2="${width}" y1="${y}" y2="${y}"/>`;
    })
    .join('')}${rows
    .map((row, index) => {
      const center = step * (index + 0.5);
      return `<g data-chart-month="${esc(row.month)}"><title>${esc(row.month)}: income ${esc(money(row.gainsCents))}; expenses ${esc(money(row.expensesCents))}</title><rect class="entry-analysis-income-bar" x="${center - gap / 2 - bar}" y="${bottom - row.gainsCents * scale}" width="${bar}" height="${row.gainsCents * scale}"/><rect class="entry-analysis-expense-bar" x="${center + gap / 2}" y="${bottom - row.expensesCents * scale}" width="${bar}" height="${row.expensesCents * scale}"/>${index % labelStep === 0 ? `<text class="entry-analysis-axis" x="${center}" y="210" text-anchor="middle">${esc(row.month)}</text>` : ''}</g>`;
    })
    .join('')}</svg>`;
}

function monthlyChart(report) {
  const maximum = chartMaximum(report),
    visible = Math.min(CHART_MONTHS, report.months.length),
    lastStart = report.months.length - visible;
  return `<div class="entry-analysis-chart-frame"><svg class="entry-analysis-chart-y-axis" width="144" height="232" viewBox="0 0 144 232" aria-hidden="true">${chartLevels(
    maximum,
  )
    .map((fraction) => {
      const y = 188 - fraction * 172;
      return `<text class="entry-analysis-axis" x="136" y="${y + 4}" text-anchor="end">${esc(money(Math.round(maximum * fraction)))}</text>`;
    })
    .join(
      '',
    )}</svg><div class="entry-analysis-chart-scroll" role="region" aria-label="Monthly income and expense chart" tabindex="0">${monthlyPlot(report, 600)}</div></div>${report.months.length > CHART_MONTHS ? `<label class="entry-analysis-chart-controls">Visible 24-month window<input id="analysis-chart-start" class="entry-analysis-chart-range" type="range" min="0" max="${lastStart}" step="1" value="${lastStart}" aria-describedby="entry-analysis-chart-window"></label>` : ''}<p class="recording-note entry-analysis-chart-window-label" id="entry-analysis-chart-window" role="status"></p><div class="entry-analysis-chart-key" aria-hidden="true"><span class="entry-analysis-income-key">Income</span><span class="entry-analysis-expense-key">Expenses</span></div><p class="recording-note">${report.months.length > CHART_MONTHS ? 'All selected months are plotted. Scroll horizontally or move the window control to review 24 months at a time; the latest 24 are shown initially. ' : 'All selected months are plotted. '}The table includes every month in the range, including months without selected activity.</p>`;
}

const categoryHeadings = [
  'Category',
  { label: 'Entries', align: 'end' },
  { label: 'Amount', align: 'end' },
  { label: 'Share', align: 'end' },
];
const categoryDetailsId = (kind) => `analysis-${kind}-all-categories`;
const colorClass = (rank) => `entry-analysis-category-color-${rank}`;
function categoryRow(row, color) {
  return `<tr data-analysis-category="${esc(row.categoryId)}"><td>${esc(row.label)}</td><td class="numeric">${row.count}</td><td class="amount">${money(row.amountCents)}</td><td><span class="entry-analysis-share"><svg viewBox="0 0 100 8" class="entry-analysis-share-bar" aria-hidden="true"><rect class="entry-analysis-share-track" x="0" y="0" width="100" height="8" rx="4"/><rect class="entry-analysis-category-fill ${color}" x="0" y="0" width="${Math.max(0, Math.min(100, (row.share ?? 0) * 100))}" height="8" rx="4"/></svg><span>${esc(percent(row.share))}</span></span></td></tr>`;
}
function categoryTable(kind, rows, state, colorFor, top = false) {
  const key = `analysis-${kind}-${top ? 'top-categories' : 'categories'}`,
    empty = `No ${kind === 'gain' ? 'income' : 'expenses'} in this selection and date range.`;
  if (top)
    return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${key}" tabindex="0"><table><thead><tr>${categoryHeadings.map((heading) => `<th scope="col" class="table-align-${typeof heading === 'string' ? 'start' : heading.align}">${typeof heading === 'string' ? heading : heading.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => categoryRow(row, colorFor(row))).join('') || `<tr><td colspan="4" class="table-empty">${empty}</td></tr>`}</tbody></table></div></div>`;
  return tableHTML(
    key,
    categoryHeadings,
    rows,
    (row) => categoryRow(row, colorFor(row)),
    state,
    CATEGORY_PAGE_SIZE,
    empty,
  );
}
function categoryPie(kind, total, topRows, colorFor, categoryCount) {
  const noun = kind === 'gain' ? 'Income' : 'Expenses',
    rows = topRows
      .filter((row) => row.amountCents > 0)
      .map((row) => ({ ...row, color: colorFor(row) }));
  if (!total)
    return `<div class="entry-analysis-category-pie-empty" role="status">No ${kind === 'gain' ? 'income' : 'expenses'} in this selection and date range. No allocation pie is available.</div>`;
  const remainder = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row.amountCents), 0n);
  if (remainder > 0n)
    rows.push({
      label: 'Other categories',
      amountCents: Number(remainder),
      share: Number(remainder) / total,
      remainder: true,
      remainingCount: categoryCount - topRows.length,
      color: colorClass('other'),
    });
  let angle = -Math.PI / 2;
  const point = (value) =>
    `${(120 + 96 * Math.cos(value)).toFixed(6)} ${(120 + 96 * Math.sin(value)).toFixed(6)}`;
  const slices = rows.map((row, index) => {
    const start = angle;
    angle = index === rows.length - 1 ? Math.PI * 1.5 : angle + row.share * Math.PI * 2;
    const caption = `${row.label}${row.remainder ? ` (${row.remainingCount} remaining)` : ''}: ${money(row.amountCents)} (${percent(row.share)})`,
      identity = row.remainder
        ? 'data-category-pie-other="true"'
        : `data-category-pie-id="${esc(row.categoryId)}"`;
    return rows.length === 1
      ? `<circle class="entry-analysis-category-slice ${row.color}" ${identity} cx="120" cy="120" r="96"><title>${esc(caption)}</title></circle>`
      : `<path class="entry-analysis-category-slice ${row.color}" ${identity} d="M120 120 L${point(start)} A96 96 0 0 1 ${point((start + angle) / 2)} A96 96 0 0 1 ${point(angle)} Z"><title>${esc(caption)}</title></path>`;
  });
  return `<figure class="entry-analysis-category-pie-figure"><svg class="entry-analysis-category-pie" data-category-pie="${kind}" viewBox="0 0 240 240" role="img" aria-labelledby="analysis-${kind}-pie-title analysis-${kind}-pie-description"><title id="analysis-${kind}-pie-title">${noun} by category</title><desc id="analysis-${kind}-pie-description">Top categories through the selected activity-date range, using the full ${kind === 'gain' ? 'income' : 'expense'} total of ${esc(money(total))}. Other categories combines any categories outside the displayed Top N. Exact amounts and percentages appear in the legend and tables.</desc>${slices.join('')}</svg><figcaption>Total ${kind === 'gain' ? 'income' : 'expenses'}: <strong>${money(total)}</strong></figcaption><ul class="entry-analysis-category-legend">${rows.map((row) => `<li${row.remainder ? ' data-category-remainder="true"' : ` data-category-legend-id="${esc(row.categoryId)}"`}><span class="entry-analysis-category-swatch ${row.color}" aria-hidden="true"></span><span>${esc(row.label)}${row.remainder ? ` (${row.remainingCount} remaining)` : ''}</span><span class="entry-analysis-category-legend-amount">${money(row.amountCents)}</span><span class="entry-analysis-category-legend-share">${esc(percent(row.share))}</span></li>`).join('')}</ul></figure>`;
}
function categorySection(kind, report, state, topCount, detailsOpen) {
  const rows = report.categories[kind],
    ranked = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) =>
        a.row.amountCents === b.row.amountCents
          ? a.index - b.index
          : a.row.amountCents > b.row.amountCents
            ? -1
            : 1,
      )
      .map(({ row }) => row),
    topRows = ranked.slice(0, topCount),
    ranks = new Map(topRows.map((row, index) => [row.categoryId, index])),
    colorFor = (row) => colorClass(ranks.has(row.categoryId) ? ranks.get(row.categoryId) : 'other'),
    income = kind === 'gain';
  return `<section class="recording-section entry-analysis-category-card" data-category-kind="${kind}"><div class="recording-table-heading"><h2>${income ? 'Income' : 'Expenses'} by category</h2><span class="scope-note">Share of ${income ? 'income' : 'expenses'}</span></div><div class="entry-analysis-category-distribution"><div class="entry-analysis-category-pie-panel">${categoryPie(kind, income ? report.gainsCents : report.expensesCents, topRows, colorFor, rows.length)}</div><div class="entry-analysis-category-top-table"><p class="recording-note">Top ${topRows.length} available categories · Ranked by share</p>${categoryTable(kind, topRows, null, colorFor, true)}</div></div><details class="entry-analysis-category-details" id="${categoryDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>All ${income ? 'income' : 'expense'} categories</summary><p class="recording-note">All categories in their existing alphabetical order.</p>${categoryTable(kind, rows, state, colorFor)}</details></section>`;
}

export function createEntryAnalysisUI(ctx) {
  const root = $('entry-analysis-content');
  const pages = { months: { page: 1 }, gain: { page: 1 }, expense: { page: 1 } };
  let from = '',
    through = '',
    automatic = true,
    topCount = 5,
    monthlyValuesOpen = false,
    categoryDetailsOpen = { gain: false, expense: false },
    resetEpoch = 0,
    chartScope = '',
    chartMonth = null,
    releaseChart = () => {};

  function resetPages() {
    for (const state of Object.values(pages)) state.page = 1;
  }
  function reset() {
    resetEpoch++;
    releaseChart();
    from = through = '';
    automatic = true;
    topCount = 5;
    monthlyValuesOpen = false;
    categoryDetailsOpen = { gain: false, expense: false };
    chartScope = '';
    chartMonth = null;
    resetPages();
  }
  function bindChart(report) {
    const viewport = root.querySelector('.entry-analysis-chart-scroll'),
      slider = $('analysis-chart-start'),
      label = $('entry-analysis-chart-window'),
      visible = Math.min(CHART_MONTHS, report.months.length),
      maximum = report.months.length - visible,
      scope = `${report.from}/${report.through}`;
    if (scope !== chartScope) {
      chartScope = scope;
      chartMonth = null;
    }
    if (chartMonth === null) chartMonth = maximum;
    let active = true,
      step = 1,
      observer = null;
    const enabled = () => active && ctx.isActive?.() !== false;
    const sync = () => {
      if (!enabled()) return;
      const left = Number(viewport.scrollLeft) || 0,
        end = Math.max(
          0,
          (Number(viewport.scrollWidth) || 0) - (Number(viewport.clientWidth) || 0),
        );
      chartMonth = Math.max(0, Math.min(maximum, left / step));
      if (end > 0 && end - left <= 1.5) chartMonth = maximum;
      const first = Math.round(chartMonth),
        last = first + visible - 1;
      label.textContent = `Chart window: ${report.months[first].month}–${report.months[last].month} · ${visible} of ${report.months.length} months`;
      if (slider) {
        slider.value = String(first);
        slider.setAttribute(
          'aria-valuetext',
          `${report.months[first].month} through ${report.months[last].month}`,
        );
      }
    };
    const layout = () => {
      if (!enabled()) return;
      const width = Number(viewport.clientWidth) || 600,
        first = Math.max(0, Math.min(maximum, chartMonth ?? maximum));
      step = width / visible;
      viewport.innerHTML = monthlyPlot(report, width);
      viewport.scrollLeft = first * step;
      sync();
    };
    const move = (month) => {
      if (!enabled()) return;
      chartMonth = Math.max(0, Math.min(maximum, month));
      viewport.scrollLeft = chartMonth * step;
      sync();
    };
    const slide = () => move(Number(slider.value));
    const keydown = (event) => {
      const first = Math.round(chartMonth ?? maximum),
        moves = {
          ArrowLeft: first - 1,
          ArrowRight: first + 1,
          PageUp: first - CHART_MONTHS,
          PageDown: first + CHART_MONTHS,
          Home: 0,
          End: maximum,
        };
      if (!Object.hasOwn(moves, event.key)) return;
      event.preventDefault();
      move(moves[event.key]);
    };
    viewport.addEventListener('scroll', sync);
    viewport.addEventListener('keydown', keydown);
    slider?.addEventListener('input', slide);
    layout();
    if (typeof globalThis.ResizeObserver === 'function') {
      observer = new globalThis.ResizeObserver(layout);
      observer.observe(viewport);
    } else window.addEventListener('resize', layout);
    releaseChart = () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', layout);
      viewport.removeEventListener('scroll', sync);
      viewport.removeEventListener('keydown', keydown);
      slider?.removeEventListener('input', slide);
    };
  }
  function render() {
    releaseChart();
    if (!root || ctx.isActive?.() === false) return;
    const snapshot = ctx.getDocument(),
      entryIds = ctx.getSelectedEntryIds(),
      selected = new Set(entryIds),
      entries = snapshot.ledger.entries,
      selectedEntries = entries.filter((entry) => selected.has(entry.id)),
      scope = selectedEntries.length ? selectedEntries : entries;
    if (automatic) {
      const dates = scope.map((entry) => entry.activityDate).sort();
      const start = dates[0] ?? '',
        end = dates.at(-1) ?? '';
      if (start !== from || end !== through) resetPages();
      from = start;
      through = end;
    }
    let report = null,
      error = '';
    if (entries.length)
      try {
        report = analyzeEntries(snapshot, { entryIds, from, through });
      } catch (failure) {
        error = failure.message || 'The selected entries could not be analyzed.';
      }
    root.innerHTML = `<div class="entry-analysis-heading"><div><p class="eyebrow">ANALYSIS · ENTRIES</p><h1>Income & Expense analysis</h1><p class="recording-note">Analyze the checked entries using their activity dates.</p></div><button type="button" class="button button-outline" id="analysis-manage-selection">Choose entries</button></div><div class="recording-toolbar entry-analysis-toolbar" aria-label="Analysis activity-date range"><label>From activity date<input id="analysis-from" type="date" value="${esc(from)}" min="0001-01-01" max="9999-12-31"${entries.length ? '' : ' disabled'}${error ? ' aria-invalid="true" aria-describedby="entry-analysis-error"' : ''}></label><label>Through activity date<input id="analysis-through" type="date" value="${esc(through)}" min="0001-01-01" max="9999-12-31"${entries.length ? '' : ' disabled'}${error ? ' aria-invalid="true" aria-describedby="entry-analysis-error"' : ''}></label><label class="entry-analysis-top-control">Top categories shown<select id="analysis-category-top-count"${entries.length ? '' : ' disabled'}>${[5, 6, 7, 8].map((count) => `<option value="${count}"${count === topCount ? ' selected' : ''}>${count}</option>`).join('')}</select></label><button type="button" class="button button-outline" id="analysis-full-history"${entries.length ? '' : ' disabled'}>Full selected history</button></div><p class="recording-note entry-analysis-scope" role="status">${report ? `${report.includedCount} of ${report.selectedCount} selected entries in this activity-date range · ${entries.length} entries in the file.` : `${selectedEntries.length} of ${entries.length} entries selected.`} Select entries or apply a saved preset in Income & Expenses. Records filters and pagination do not limit this report.</p>${
      !entries.length
        ? '<section class="recording-empty"><h2>No entries to analyze</h2><p>Add Gain and Expense entries in Income & Expenses, or open a Finance Records JSON file. Your Analyze checkboxes control what appears here.</p></section>'
        : error
          ? `<p class="form-error entry-analysis-error" id="entry-analysis-error" role="alert">${esc(error)}</p>${summaryHTML()}`
          : `${summaryHTML(report)}${report.includedCount ? '' : '<p class="recording-note entry-analysis-empty" role="status">No selected entries fall inside this range. Totals are zero; no category shares are available.</p>'}<p class="recording-note entry-analysis-qualification">${report.activityDateUnconfirmedCount} included ${report.activityDateUnconfirmedCount === 1 ? 'entry has an unconfirmed activity date' : 'entries have unconfirmed activity dates'}; ${report.postedDateUnconfirmedCount} ${report.postedDateUnconfirmedCount === 1 ? 'has an unconfirmed posting date' : 'have unconfirmed posting dates'}. These entries remain included on their recorded activity dates. Transfers and investment principal are excluded; recorded realized results are included once as Gain/Expense entries.</p><section class="recording-section"><div class="recording-table-heading"><h2>Monthly trends</h2><span class="scope-note">Activity dates · ${report.months.length} months</span></div>${monthlyChart(report)}<details class="entry-analysis-monthly-details" id="analysis-monthly-values"${monthlyValuesOpen ? ' open' : ''}><summary>Monthly income and expense values</summary>${tableHTML(
              'analysis-months',
              [
                'Month',
                { label: 'Entries', align: 'end' },
                { label: 'Income', align: 'end' },
                { label: 'Expenses', align: 'end' },
                { label: 'Net income', align: 'end' },
              ],
              report.months,
              (row) =>
                `<tr><td>${esc(row.month)}</td><td class="numeric">${row.count}</td><td class="amount positive">${money(row.gainsCents)}</td><td class="amount">${money(row.expensesCents)}</td><td class="amount${row.netCents < 0 ? ' negative' : ''}">${money(row.netCents)}</td></tr>`,
              pages.months,
              MONTH_PAGE_SIZE,
            )}</details></section><div class="entry-analysis-categories">${categorySection('gain', report, pages.gain, topCount, categoryDetailsOpen.gain)}${categorySection('expense', report, pages.expense, topCount, categoryDetailsOpen.expense)}</div>`
    }`;
    $('analysis-manage-selection').addEventListener('click', () => ctx.navigate('records'));
    for (const id of ['analysis-from', 'analysis-through'])
      $(id).addEventListener('change', () => {
        const focused = document.activeElement?.id;
        from = $('analysis-from').value;
        through = $('analysis-through').value;
        automatic = false;
        resetPages();
        render();
        if (focused === id) $(id)?.focus();
      });
    $('analysis-category-top-count').addEventListener('change', () => {
      const requested = Number($('analysis-category-top-count').value);
      if ([5, 6, 7, 8].includes(requested)) topCount = requested;
      pages.gain.page = pages.expense.page = 1;
      render();
      $('analysis-category-top-count')?.focus();
    });
    $('analysis-full-history').addEventListener('click', () => {
      automatic = true;
      resetPages();
      render();
      $('analysis-full-history')?.focus();
    });
    if (!report) return;
    const epoch = resetEpoch,
      monthlyDetails = $('analysis-monthly-values');
    monthlyDetails.addEventListener('toggle', () => {
      if (epoch === resetEpoch && monthlyDetails.isConnected)
        monthlyValuesOpen = monthlyDetails.open;
    });
    for (const kind of ['gain', 'expense']) {
      const details = $(categoryDetailsId(kind));
      details.addEventListener('toggle', () => {
        if (epoch === resetEpoch && details.isConnected) categoryDetailsOpen[kind] = details.open;
      });
    }
    bindChart(report);
    bindPager(root, 'analysis-months', report.months.length, pages.months, MONTH_PAGE_SIZE, render);
    for (const kind of ['gain', 'expense'])
      bindPager(
        root,
        `analysis-${kind}-categories`,
        report.categories[kind].length,
        pages[kind],
        CATEGORY_PAGE_SIZE,
        render,
      );
  }
  return { render, reset };
}
