import { analyzeEntries } from '../analysis/entry-analysis.mjs';
import { $, esc, createUIHelpers } from './shared-controls.mjs';

import { createPresentation } from './formatting.mjs';

export function createEntryAnalysisUI(ctx) {
  let currentPresentation = createPresentation();
  const presentation = () => currentPresentation;
  const {
    t,
    money,
    currencyLabel,
    accountChoices,
    kindLabel,
    showSelectionFilter,
    tableHTML,
    tableLabel,
    bindPager,
    compareNames,
  } = createUIHelpers(presentation);

  const MONTH_PAGE_SIZE = 12;
  const CATEGORY_PAGE_SIZE = 10;
  const CHART_MONTHS = 24;
  const percent = (share) =>
    share === null ? '—' : share > 0 && share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;

  function summaryHTML(report = null) {
    return `<div class="summary-grid entry-analysis-summary">${[
      [
        t('analysis.total_income_450a92', 'Total income'),
        report?.gainsCents,
        t('analysis.selected_gain_entries_57e589', 'Selected Gain entries'),
      ],
      [
        t('analysis.total_expenses_67fe37', 'Total expenses'),
        report?.expensesCents,
        t('analysis.selected_expense_entries_6cd141', 'Selected Expense entries'),
      ],
      [
        t('analysis.net_income_84c5b8', 'Net income'),
        report?.netCents,
        t('analysis.income_minus_expenses_a5e384', 'Income minus expenses'),
      ],
    ]
      .map(
        ([label, value, caption], index) =>
          `<div class="summary-stat"><span class="stat-label">${esc(currencyLabel(label))}</span><strong class="stat-value${index === 0 ? ' gains-value' : ''}" data-analysis-total="${['income', 'expenses', 'net'][index]}">${value === undefined ? '—' : money(value)}</strong><span class="stat-caption">${report ? caption : t('analysis.correct_the_activity_date_range_20ea5b', 'Correct the activity-date range')}</span></div>`,
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
    return `<svg class="entry-analysis-chart" width="${width}" height="232" viewBox="0 0 ${width} 232" data-window-months="${visible}" data-month-count="${rows.length}" data-slot-width="${step}" role="img" aria-labelledby="entry-monthly-chart-title entry-monthly-chart-description"><title id="entry-monthly-chart-title">${esc(currencyLabel(t('analysis.monthly_income_and_expenses_bfbc63', 'Monthly income and expenses')))}</title><desc id="entry-monthly-chart-description">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))}. ${esc(t('analysis.monthlyBarsDescription', 'Paired bars show recorded income and expenses for every month from {from} through {through}. {window}Exact amounts, including net income, appear in the monthly table.', { from: rows[0].month, through: rows.at(-1).month, window: rows.length > CHART_MONTHS ? t('analysis.scroll_horizontally_through_a_24_month_window_to_review_th_35a87a', 'Scroll horizontally through a 24-month window to review the full range. ') : '' }))}</desc>${chartLevels(
      maximum,
    )
      .map((fraction) => {
        const y = bottom - fraction * (bottom - top);
        return `<line class="entry-analysis-gridline" x1="0" x2="${width}" y1="${y}" y2="${y}"/>`;
      })
      .join('')}${rows
      .map((row, index) => {
        const center = step * (index + 0.5);
        return `<g data-chart-month="${esc(row.month)}"><title>${esc(t('moneyAnalysis.monthlyBarValues', '{month}: income ({currency}) {income}; expenses ({currency}) {expenses}', { month: row.month, currency: presentation().currency, income: money(row.gainsCents), expenses: money(row.expensesCents) }))}</title><rect class="entry-analysis-income-bar" x="${center - gap / 2 - bar}" y="${bottom - row.gainsCents * scale}" width="${bar}" height="${row.gainsCents * scale}"/><rect class="entry-analysis-expense-bar" x="${center + gap / 2}" y="${bottom - row.expensesCents * scale}" width="${bar}" height="${row.expensesCents * scale}"/>${index % labelStep === 0 ? `<text class="entry-analysis-axis" x="${center}" y="210" text-anchor="middle">${esc(row.month)}</text>` : ''}</g>`;
      })
      .join('')}</svg>`;
  }

  function monthlyChart(report) {
    const maximum = chartMaximum(report),
      visible = Math.min(CHART_MONTHS, report.months.length),
      lastStart = report.months.length - visible;
    return `<p class="recording-note analysis-chart-unit">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))}</p><div class="entry-analysis-chart-frame"><svg class="entry-analysis-chart-y-axis" width="144" height="232" viewBox="0 0 144 232" aria-hidden="true">${chartLevels(
      maximum,
    )
      .map((fraction) => {
        const y = 188 - fraction * 172;
        return `<text class="entry-analysis-axis" x="136" y="${y + 4}" text-anchor="end">${esc(money(Math.round(maximum * fraction)))}</text>`;
      })
      .join(
        '',
      )}</svg><div class="entry-analysis-chart-scroll" role="region" aria-label="${esc(t('analysis.monthly_income_and_expense_chart_c747c5', 'Monthly income and expense chart'))}" tabindex="0">${monthlyPlot(report, 600)}</div></div>${report.months.length > CHART_MONTHS ? `<label class="entry-analysis-chart-controls">${esc(t('analysis.visible_24_month_window_03ac9b', 'Visible 24-month window'))}<input id="analysis-chart-start" class="entry-analysis-chart-range" type="range" min="0" max="${lastStart}" step="1" value="${lastStart}" aria-describedby="entry-analysis-chart-window"></label>` : ''}<p class="recording-note entry-analysis-chart-window-label" id="entry-analysis-chart-window" role="status"></p><div class="entry-analysis-chart-key" aria-hidden="true"><span class="entry-analysis-income-key">${esc(t('analysis.income_1c89b1', 'Income'))}</span><span class="entry-analysis-expense-key">${esc(t('analysis.expenses_8d437d', 'Expenses'))}</span></div><p class="recording-note">${report.months.length > CHART_MONTHS ? t('analysis.all_selected_months_are_plotted_scroll_horizontally_or_mov_6f3b50', 'All selected months are plotted. Scroll horizontally or move the window control to review 24 months at a time; the latest 24 are shown initially. ') : t('analysis.all_selected_months_are_plotted_9e0054', 'All selected months are plotted. ')}${esc(t('analysis.the_table_includes_every_month_in_the_range_including_mont_82f56d', 'The table includes every month in the range, including months without selected activity.'))}</p>`;
  }

  function categoryHeadings() {
    return [
      t('analysis.category_a3c686', 'Category'),
      { label: t('analysis.entries_f056d0', 'Entries'), align: 'end' },
      { label: t('analysis.amount_43dc85', 'Amount'), align: 'end', monetary: true },
      { label: t('analysis.share_09ca55', 'Share'), align: 'end' },
    ];
  }
  const categoryDetailsId = (kind) => `analysis-${kind}-all-categories`;
  const colorClass = (rank) => `entry-analysis-category-color-${rank}`;
  function categoryRow(row, color) {
    return `<tr data-analysis-category="${esc(row.categoryId)}"><td>${esc(row.label)}</td><td class="numeric">${row.count}</td><td class="amount">${money(row.amountCents)}</td><td><span class="entry-analysis-share"><svg viewBox="0 0 100 8" class="entry-analysis-share-bar" aria-hidden="true"><rect class="entry-analysis-share-track" x="0" y="0" width="100" height="8" rx="4"/><rect class="entry-analysis-category-fill ${color}" x="0" y="0" width="${Math.max(0, Math.min(100, (row.share ?? 0) * 100))}" height="8" rx="4"/></svg><span>${esc(percent(row.share))}</span></span></td></tr>`;
  }
  function categoryTable(kind, rows, state, colorFor, top = false) {
    const key = `analysis-${kind}-${top ? 'top-categories' : 'categories'}`,
      empty =
        kind === 'gain'
          ? t('analysis.noIncomeRange', 'No income in this selection and date range.')
          : t('analysis.noExpenseRange', 'No expenses in this selection and date range.');
    if (top)
      return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${esc(tableLabel(key))}" data-table-key="${esc(key)}" tabindex="0"><table><thead><tr>${categoryHeadings()
        .map(
          (heading) =>
            `<th scope="col" class="table-align-${typeof heading === 'string' ? 'start' : heading.align}">${esc(typeof heading === 'string' ? heading : heading.monetary ? currencyLabel(heading.label) : heading.label)}</th>`,
        )
        .join(
          '',
        )}</tr></thead><tbody>${rows.map((row) => categoryRow(row, colorFor(row))).join('') || `<tr><td colspan="4" class="table-empty">${empty}</td></tr>`}</tbody></table></div></div>`;
    return tableHTML(
      key,
      categoryHeadings(),
      rows,
      (row) => categoryRow(row, colorFor(row)),
      state,
      CATEGORY_PAGE_SIZE,
      empty,
    );
  }
  function categoryPie(kind, total, topRows, colorFor, categoryCount) {
    const noun =
        kind === 'gain'
          ? t('analysis.income_1c89b1', 'Income')
          : t('analysis.expenses_8d437d', 'Expenses'),
      rows = topRows
        .filter((row) => row.amountCents > 0)
        .map((row) => ({ ...row, color: colorFor(row) }));
    if (!total)
      return `<div class="entry-analysis-category-pie-empty" role="status">${kind === 'gain' ? t('analysis.noIncomePie', 'No income in this selection and date range. No allocation pie is available.') : t('analysis.noExpensePie', 'No expenses in this selection and date range. No allocation pie is available.')}</div>`;
    const remainder = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row.amountCents), 0n);
    if (remainder > 0n)
      rows.push({
        label: t('analysis.other_categories_a9a681', 'Other categories'),
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
      const caption = `${currencyLabel(`${row.label}${row.remainder ? t('analysis.remaining', ' ({count} remaining)', { count: row.remainingCount }) : ''}`)}: ${money(row.amountCents)} (${percent(row.share)})`,
        identity = row.remainder
          ? 'data-category-pie-other="true"'
          : `data-category-pie-id="${esc(row.categoryId)}"`;
      return rows.length === 1
        ? `<circle class="entry-analysis-category-slice ${row.color}" ${identity} cx="120" cy="120" r="96"><title>${esc(caption)}</title></circle>`
        : `<path class="entry-analysis-category-slice ${row.color}" ${identity} d="M120 120 L${point(start)} A96 96 0 0 1 ${point((start + angle) / 2)} A96 96 0 0 1 ${point(angle)} Z"><title>${esc(caption)}</title></path>`;
    });
    return `<figure class="entry-analysis-category-pie-figure"><svg class="entry-analysis-category-pie" data-category-pie="${kind}" viewBox="0 0 240 240" role="img" aria-labelledby="analysis-${kind}-pie-title analysis-${kind}-pie-description"><title id="analysis-${kind}-pie-title">${esc(currencyLabel(kind === 'gain' ? t('analysis.incomeByCategory', 'Income by category') : t('analysis.expensesByCategory', 'Expenses by category')))}</title><desc id="analysis-${kind}-pie-description">${esc(currencyLabel(noun))}. ${esc(t('analysis.categoryPieDescription', 'Top categories through the selected activity-date range, using the full {kind} total of {total}. Other categories combines any categories outside the displayed Top N. Exact amounts and percentages appear in the legend and tables.', { kind: kind === 'gain' ? t('analysis.incomeNoun', 'income') : t('analysis.expenseNoun', 'expense'), total: money(total) }))}</desc>${slices.join('')}</svg><figcaption>${esc(currencyLabel(kind === 'gain' ? t('analysis.total_income_450a92', 'Total income') : t('analysis.total_expenses_67fe37', 'Total expenses')))}: <strong>${money(total)}</strong></figcaption><p class="recording-note analysis-legend-units">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))} · ${esc(t('analysis.share_09ca55', 'Share'))}</p><ul class="entry-analysis-category-legend">${rows.map((row) => `<li${row.remainder ? ' data-category-remainder="true"' : ` data-category-legend-id="${esc(row.categoryId)}"`}><span class="entry-analysis-category-swatch ${row.color}" aria-hidden="true"></span><span>${esc(row.label)}${row.remainder ? t('analysis.remaining', ' ({count} remaining)', { count: row.remainingCount }) : ''}</span><span class="entry-analysis-category-legend-amount">${money(row.amountCents)}</span><span class="entry-analysis-category-legend-share">${esc(percent(row.share))}</span></li>`).join('')}</ul></figure>`;
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
      colorFor = (row) =>
        colorClass(ranks.has(row.categoryId) ? ranks.get(row.categoryId) : 'other'),
      income = kind === 'gain';
    return `<section class="recording-section entry-analysis-category-card" data-category-kind="${kind}"><div class="recording-table-heading"><h2>${esc(currencyLabel(income ? t('analysis.incomeByCategory', 'Income by category') : t('analysis.expensesByCategory', 'Expenses by category')))}</h2><span class="scope-note">${income ? t('analysis.incomeShare', 'Share of income') : t('analysis.expenseShare', 'Share of expenses')}</span></div><div class="entry-analysis-category-distribution"><div class="entry-analysis-category-pie-panel">${categoryPie(kind, income ? report.gainsCents : report.expensesCents, topRows, colorFor, rows.length)}</div><div class="entry-analysis-category-top-table"><p class="recording-note">${esc(t('analysis.categoryRanks', 'Top {count} available categories · Ranked by share', { count: topRows.length }))}</p>${categoryTable(kind, topRows, null, colorFor, true)}</div></div><details class="entry-analysis-category-details" id="${categoryDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>${income ? t('analysis.allIncomeCategories', 'All income categories') : t('analysis.allExpenseCategories', 'All expense categories')}</summary><p class="recording-note">${esc(t('analysis.all_categories_in_their_existing_alphabetical_order_d63ec4', 'All categories in their existing alphabetical order.'))}</p>${categoryTable(
      kind,
      rows
        .slice()
        .sort(
          (a, b) =>
            compareNames(a.label, b.label) || a.categoryId.localeCompare(b.categoryId, 'en'),
        ),
      state,
      colorFor,
    )}</details></section>`;
  }

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
      label.textContent = t(
        'analysis.chartWindow',
        'Chart window: {first}–{last} · {visible} of {total} months',
        {
          first: report.months[first].month,
          last: report.months[last].month,
          visible,
          total: report.months.length,
        },
      );
      if (slider) {
        slider.value = String(first);
        slider.setAttribute(
          'aria-valuetext',
          t('analysis.dateThrough', '{first} through {last}', {
            first: report.months[first].month,
            last: report.months[last].month,
          }),
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
    const snapshot = ctx.getDocument();
    currentPresentation =
      ctx.getPresentation?.() ?? createPresentation({ currency: snapshot.ledger.currency });
    const entryIds = ctx.getSelectedEntryIds(),
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
        error = presentation().error(failure);
      }
    root.innerHTML = `<div class="entry-analysis-heading"><div><p class="eyebrow">${esc(t('analysis.analysis_entries_2fa5de', 'ANALYSIS · ENTRIES'))}</p><h1>${esc(t('analysis.income_expense_analysis_9d8605', 'Income & Expense analysis'))}</h1><p class="recording-note">${esc(t('analysis.analyze_the_checked_entries_using_their_activity_dates_163316', 'Analyze the checked entries using their activity dates.'))}</p></div><button type="button" class="button button-outline" id="analysis-manage-selection">${esc(t('analysis.choose_entries_f31910', 'Choose entries'))}</button></div><div class="recording-toolbar entry-analysis-toolbar" aria-label="${esc(t('analysis.analysis_activity_date_range_5ea812', 'Analysis activity-date range'))}"><label>${esc(t('analysis.from_activity_date_6fd5fd', 'From activity date'))}<input id="analysis-from" type="date" value="${esc(from)}" min="0001-01-01" max="9999-12-31"${entries.length ? '' : ' disabled'}${error ? ' aria-invalid="true" aria-describedby="entry-analysis-error"' : ''}></label><label>${esc(t('analysis.through_activity_date_c07cb1', 'Through activity date'))}<input id="analysis-through" type="date" value="${esc(through)}" min="0001-01-01" max="9999-12-31"${entries.length ? '' : ' disabled'}${error ? ' aria-invalid="true" aria-describedby="entry-analysis-error"' : ''}></label><label class="entry-analysis-top-control">${esc(t('analysis.top_categories_shown_4d1c81', 'Top categories shown'))}<select id="analysis-category-top-count"${entries.length ? '' : ' disabled'}>${[5, 6, 7, 8].map((count) => `<option value="${count}"${count === topCount ? ' selected' : ''}>${count}</option>`).join('')}</select></label><button type="button" class="button button-outline" id="analysis-full-history"${entries.length ? '' : ' disabled'}>${esc(t('analysis.full_selected_history_cfb917', 'Full selected history'))}</button></div><p class="recording-note entry-analysis-scope" role="status">${esc(report ? t('analysis.entryScope', '{included} of {selected} selected entries in this activity-date range · {total} entries in the file.', { included: report.includedCount, selected: report.selectedCount, total: entries.length }) : t('analysis.entrySelection', '{selected} of {total} entries selected.', { selected: selectedEntries.length, total: entries.length }))} ${esc(t('analysis.select_entries_or_apply_a_saved_preset_in_income_expenses__fa7d7c', 'Select entries or apply a saved preset in Income & Expenses. Records filters and pagination do not limit this report.'))}</p>${
      !entries.length
        ? `<section class="recording-empty"><h2>${esc(t('analysis.no_entries_to_analyze_99e452', 'No entries to analyze'))}</h2><p>${esc(t('analysis.add_gain_and_expense_entries_in_income_expenses_or_open_a__b14afc', 'Add Gain and Expense entries in Income & Expenses, or open a Finance Records JSON file. Your Analyze checkboxes control what appears here.'))}</p></section>`
        : error
          ? `<p class="form-error entry-analysis-error" id="entry-analysis-error" role="alert">${esc(error)}</p>${summaryHTML()}`
          : `${summaryHTML(report)}${report.includedCount ? '' : `<p class="recording-note entry-analysis-empty" role="status">${esc(t('analysis.no_selected_entries_fall_inside_this_range_totals_are_zero_16cfe9', 'No selected entries fall inside this range. Totals are zero; no category shares are available.'))}</p>`}<p class="recording-note entry-analysis-qualification">${esc(t('analysis.entryUncertainty', '{activityCount} included {activityClause}; {postingCount} {postingClause}. These entries remain included on their recorded activity dates. Transfers and investment principal are excluded; recorded realized results are included once as Gain/Expense entries.', { activityCount: report.activityDateUnconfirmedCount, postingCount: report.postedDateUnconfirmedCount, activityClause: report.activityDateUnconfirmedCount === 1 ? t('analysis.entry_has_an_unconfirmed_activity_date_e8c231', 'entry has an unconfirmed activity date') : t('analysis.entries_have_unconfirmed_activity_dates_f1b2e3', 'entries have unconfirmed activity dates'), postingClause: report.postedDateUnconfirmedCount === 1 ? t('analysis.has_an_unconfirmed_posting_date_0a790d', 'has an unconfirmed posting date') : t('analysis.have_unconfirmed_posting_dates_4ebf2e', 'have unconfirmed posting dates') }))}</p><section class="recording-section"><div class="recording-table-heading"><h2>${esc(t('analysis.monthly_trends_8288da', 'Monthly trends'))}</h2><span class="scope-note">${esc(t('analysis.activity_dates_1e3568', 'Activity dates ·'))} ${report.months.length} ${esc(t('analysis.months_f14943', 'months'))}</span></div>${monthlyChart(report)}<details class="entry-analysis-monthly-details" id="analysis-monthly-values"${monthlyValuesOpen ? ' open' : ''}><summary>${esc(t('analysis.monthly_income_and_expense_values_d93b24', 'Monthly income and expense values'))}</summary>${tableHTML(
              'analysis-months',
              [
                t('analysis.month_082bc3', 'Month'),
                { label: t('analysis.entries_f056d0', 'Entries'), align: 'end' },
                { label: t('analysis.income_1c89b1', 'Income'), align: 'end', monetary: true },
                { label: t('analysis.expenses_8d437d', 'Expenses'), align: 'end', monetary: true },
                {
                  label: t('analysis.net_income_84c5b8', 'Net income'),
                  align: 'end',
                  monetary: true,
                },
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
