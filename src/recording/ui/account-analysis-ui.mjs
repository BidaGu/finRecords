import { analyzeAccounts } from '../analysis/account-analysis.mjs';
import { latestAccountDate } from '../core/account-ledger.mjs';
import { validDate } from '../core/values.mjs';
import { $, esc, createUIHelpers } from './shared-controls.mjs';

import { createPresentation } from './formatting.mjs';

export function createAccountAnalysisUI(ctx) {
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

  const PAGE_SIZE = 20;
  const FULL_TYPE_PAGE_SIZE = 10;
  const percent = (share) =>
    share === null ? '—' : share > 0 && share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;
  const typeClass = (kind) => `account-analysis-type-${esc(kind)}`;
  function partialMonth(row) {
    const [year, month, day] = row.through.split('-').map(Number),
      leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
      days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day !== days[month - 1];
  }

  function summaryHTML(report = null) {
    return `<div class="summary-grid account-analysis-summary">${[
      [
        t('analysis.recorded_assets_987892', 'Recorded assets'),
        'assetsCents',
        t(
          'analysis.positive_recorded_account_balances_c8bb55',
          'Positive recorded account balances',
        ),
      ],
      [
        t('analysis.liabilities_556a42', 'Liabilities'),
        'liabilitiesCents',
        t(
          'analysis.negative_recorded_account_balances_682e8e',
          'Negative recorded account balances',
        ),
      ],
      [
        t('analysis.recorded_net_assets_d5700c', 'Recorded net assets'),
        'netAssetsCents',
        t('analysis.recorded_assets_minus_liabilities_ce42a7', 'Recorded assets minus liabilities'),
      ],
    ]
      .map(
        ([label, key, caption]) =>
          `<div class="summary-stat"><span class="stat-label">${esc(currencyLabel(label))}</span><strong class="stat-value" data-account-analysis-total="${key}">${report ? money(report[key]) : '—'}</strong><span class="stat-caption">${report ? caption : t('analysis.correct_the_report_inputs_5f2360', 'Correct the report inputs')}</span></div>`,
      )
      .join('')}</div>`;
  }

  function typeHeadings() {
    return [
      t('analysis.account_type_144b49', 'Account type'),
      { label: t('analysis.selected_accounts_18d7e6', 'Selected accounts'), align: 'end' },
      { label: t('analysis.amount_43dc85', 'Amount'), align: 'end', monetary: true },
      { label: t('analysis.share_09ca55', 'Share'), align: 'end' },
    ];
  }
  function distributionRow(kind, row) {
    const amountKey = kind === 'assets' ? 'assetsCents' : 'liabilitiesCents',
      shareKey = kind === 'assets' ? 'assetShare' : 'liabilityShare',
      share = row[shareKey];
    return `<tr data-account-type="${esc(row.kind)}"><td>${esc(kindLabel(row.kind))}</td><td class="numeric">${row.accountCount}</td><td class="amount">${money(row[amountKey])}</td><td><span class="account-analysis-share"><svg class="account-analysis-share-bar" viewBox="0 0 100 8" aria-hidden="true"><rect class="account-analysis-share-track" x="0" y="0" width="100" height="8" rx="4"/><rect class="account-analysis-type-fill ${typeClass(row.kind)}" x="0" y="0" width="${Math.max(0, Math.min(100, (share ?? 0) * 100))}" height="8" rx="4"/></svg><span>${esc(percent(share))}</span></span></td></tr>`;
  }
  function rankedTypes(kind, rows, topCount) {
    const key = kind === 'assets' ? 'assetsCents' : 'liabilitiesCents';
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) =>
        a.row[key] === b.row[key] ? a.index - b.index : a.row[key] > b.row[key] ? -1 : 1,
      )
      .slice(0, topCount)
      .map(({ row }) => row);
  }
  function distributionTable(kind, rows, state, ranked = false) {
    const key = `account-analysis-${kind}-${ranked ? 'top-types' : 'types'}`;
    if (ranked)
      return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${esc(tableLabel(key))}" data-table-key="${esc(key)}" tabindex="0"><table><thead><tr>${typeHeadings()
        .map(
          (heading) =>
            `<th scope="col" class="table-align-${typeof heading === 'string' ? 'start' : heading.align}">${esc(typeof heading === 'string' ? heading : heading.monetary ? currencyLabel(heading.label) : heading.label)}</th>`,
        )
        .join(
          '',
        )}</tr></thead><tbody>${rows.map((row) => distributionRow(kind, row)).join('') || `<tr><td colspan="4" class="table-empty">${esc(t('analysis.no_selected_account_types_9111b1', 'No selected account types.'))}</td></tr>`}</tbody></table></div></div>`;
    return tableHTML(
      key,
      typeHeadings(),
      rows,
      (row) => distributionRow(kind, row),
      state,
      FULL_TYPE_PAGE_SIZE,
      t('analysis.no_selected_account_types_9111b1', 'No selected account types.'),
    );
  }

  function distributionPie(kind, report, rankedRows) {
    const assets = kind === 'assets',
      amountKey = assets ? 'assetsCents' : 'liabilitiesCents',
      shareKey = assets ? 'assetShare' : 'liabilityShare',
      total = report[amountKey],
      rows = rankedRows.filter((row) => row[amountKey] > 0),
      title = assets
        ? t('analysis.assets_by_account_type_98747f', 'Assets by account type')
        : t('analysis.liabilities_by_account_type_e72070', 'Liabilities by account type');
    if (!total)
      return `<div class="account-analysis-pie-empty" role="status">${assets ? t('analysis.no_positive_recorded_assets_at_this_cutoff_6f6979', 'No positive recorded assets at this cutoff.') : t('analysis.no_recorded_liabilities_at_this_cutoff_38aa36', 'No recorded liabilities at this cutoff.')} ${esc(t('analysis.no_allocation_pie_is_available_6fa95c', 'No allocation pie is available.'))}</div>`;
    const remaining = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row[amountKey]), 0n);
    if (remaining > 0n)
      rows.push({
        kind: 'other',
        [amountKey]: Number(remaining),
        [shareKey]: Number(remaining) / total,
      });
    const label = (row) =>
      row.kind === 'other' ? t('analysis.other_6e6a6f', 'Other') : kindLabel(row.kind);
    let angle = -Math.PI / 2;
    const point = (value) =>
      `${(120 + 96 * Math.cos(value)).toFixed(6)} ${(120 + 96 * Math.sin(value)).toFixed(6)}`;
    const slices = rows.map((row, index) => {
      const start = angle;
      angle = index === rows.length - 1 ? Math.PI * 1.5 : angle + row[shareKey] * Math.PI * 2;
      const caption = `${currencyLabel(label(row))}: ${money(row[amountKey])} (${percent(row[shareKey])})`;
      return rows.length === 1
        ? `<circle class="account-analysis-pie-slice ${typeClass(row.kind)}" data-account-pie-kind="${esc(row.kind)}" cx="120" cy="120" r="96"><title>${esc(caption)}</title></circle>`
        : `<path class="account-analysis-pie-slice ${typeClass(row.kind)}" data-account-pie-kind="${esc(row.kind)}" d="M120 120 L${point(start)} A96 96 0 0 1 ${point((start + angle) / 2)} A96 96 0 0 1 ${point(angle)} Z"><title>${esc(caption)}</title></path>`;
    });
    return `<figure class="account-analysis-pie-figure"><svg class="account-analysis-pie" data-account-pie="${kind}" viewBox="0 0 240 240" role="img" aria-labelledby="account-${kind}-pie-title account-${kind}-pie-description"><title id="account-${kind}-pie-title">${esc(currencyLabel(title))}</title><desc id="account-${kind}-pie-description">${esc(currencyLabel(title))}. ${esc(t('analysis.pieTypeDescription', '{count} {slices}, totaling {total}, through {through}. Exact amounts and shares appear in the legend and corresponding table.', { count: rows.length, slices: rows.length === 1 ? t('analysis.oneTypeSlice', 'positive account-type slice') : t('analysis.manyTypeSlices', 'positive account-type slices'), total: money(total), through: report.through }))}</desc>${slices.join('')}</svg><figcaption>${esc(currencyLabel(assets ? t('analysis.recorded_assets_987892', 'Recorded assets') : t('analysis.liabilities_556a42', 'Liabilities')))}: <strong>${money(total)}</strong></figcaption><p class="recording-note analysis-legend-units">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))} · ${esc(t('analysis.share_09ca55', 'Share'))}</p><ul class="account-analysis-pie-legend">${rows.map((row) => `<li><span class="account-analysis-type-swatch ${typeClass(row.kind)}" aria-hidden="true"></span><span>${esc(label(row))}</span><span class="account-analysis-legend-amount">${money(row[amountKey])}</span><span class="account-analysis-legend-share">${esc(percent(row[shareKey]))}</span></li>`).join('')}</ul></figure>`;
  }

  const allocationDetailsId = (kind) => `account-analysis-${kind}-all-types`;
  function distributionSection(kind, report, page, topCount, detailsOpen) {
    const assets = kind === 'assets',
      rows = rankedTypes(kind, report.types, topCount);
    return `<section class="recording-section account-analysis-allocation"><div class="recording-table-heading"><h3>${esc(currencyLabel(assets ? t('analysis.assetsByType', 'Assets by account type') : t('analysis.liabilitiesByType', 'Liabilities by account type')))}</h3><span class="scope-note">${assets ? t('analysis.assetShare', 'Share of recorded assets') : t('analysis.liabilityShare', 'Share of liabilities')}</span></div><div class="account-analysis-distribution"><div class="account-analysis-pie-panel">${distributionPie(kind, report, rows)}</div><div class="account-analysis-distribution-table"><p class="recording-note account-analysis-ranked-label">${esc(t('analysis.typeRanks', 'Top {count} available types · Ranked by share', { count: rows.length }))}</p>${distributionTable(kind, rows, null, true)}</div></div><details class="account-analysis-all-types account-analysis-allocation-details" id="${allocationDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>${assets ? t('analysis.allAssetTypes', 'All asset types') : t('analysis.allLiabilityTypes', 'All liability types')}</summary><p class="recording-note">${esc(t('analysis.all_selected_account_types_in_their_original_type_order_6942e7', 'All selected account types in their original type order.'))}</p>${distributionTable(kind, report.types, page)}</details></section>`;
  }

  const historyDetailsId = (kind) =>
    kind === 'assets'
      ? 'account-analysis-history-details'
      : 'account-analysis-liabilities-history-details';

  function accountColumns(report, pages, detailsOpen, topCount, allTypesOpen) {
    return `<div class="account-analysis-columns">${['assets', 'liabilities'].map((kind) => `<section class="account-analysis-column" data-account-side="${kind}" aria-labelledby="account-${kind}-column-heading"><h2 id="account-${kind}-column-heading">${kind === 'assets' ? t('analysis.assets_20e338', 'Assets') : t('analysis.liabilities_556a42', 'Liabilities')}</h2>${historyHTML(kind, report, detailsOpen[kind])}${distributionSection(kind, report, pages[kind], topCount, allTypesOpen[kind])}</section>`).join('')}</div>`;
  }

  function historyHTML(kind, report, detailsOpen) {
    const { history } = report;
    const assets = kind === 'assets',
      metric = assets ? 'assetsCents' : 'liabilitiesCents',
      noun = assets
        ? t('analysis.assets_3685e3', 'assets')
        : t('analysis.liabilities_074db7', 'liabilities'),
      singular = assets
        ? t('analysis.asset_05fac9', 'asset')
        : t('analysis.liability_cf7a5b', 'liability'),
      titlePrefix = assets ? 'account-history' : 'account-liabilities-history',
      tableLabel = assets
        ? t('analysis.monthlyAssetValues', 'Monthly asset values')
        : t('analysis.monthlyLiabilityValues', 'Monthly liability values'),
      heading = `<div class="recording-table-heading"><h3>${assets ? t('analysis.monthlyAssetsByType', 'Monthly assets by account type') : t('analysis.monthlyLiabilitiesByType', 'Monthly liabilities by account type')}</h3><span class="scope-note">${esc(t('analysis.posting_dates_up_to_12_months_f013e6', 'Posting dates · Up to 12 months'))}</span></div>`;
    if (history.error)
      return `<section class="recording-section account-analysis-history">${heading}<p class="form-error" role="alert">${esc(presentation().error({ code: history.errorCode, message: history.error, params: history.errorParams }))}</p><p class="recording-note">${esc(t('analysis.the_current_cutoff_totals_and_allocation_tables_remain_ava_9f8141', 'The current-cutoff totals and allocation tables remain available below.'))}</p></section>`;
    if (!history.months.length)
      return `<section class="recording-section account-analysis-history">${heading}<p class="recording-note">${esc(t('analysis.no_selected_accounts_were_open_on_or_before_this_cutoff_abc4e2', 'No selected accounts were open on or before this cutoff.'))}</p></section>`;
    const kinds = report.types.map((row) => row.kind),
      months = history.months,
      maximum = Math.max(0, ...months.flatMap((row) => row.types.map((type) => type[metric]))),
      left = 124,
      right = 488,
      top = 14,
      bottom = 176,
      x = (index) =>
        months.length === 1
          ? (left + right) / 2
          : left + ((right - left) * index) / (months.length - 1),
      y = (value) => (maximum ? bottom - ((bottom - top) * value) / maximum : bottom),
      labelStep = Math.max(1, Math.ceil(months.length / 4)),
      partial = partialMonth(months.at(-1));
    const lines = kinds.map((typeKind) => {
      const values = months.map((row) => row.types.find((type) => type.kind === typeKind)[metric]);
      return `<g class="${typeClass(typeKind)}"><polyline class="account-analysis-history-line" data-account-history-series="${esc(typeKind)}" points="${values.map((value, index) => `${x(index).toFixed(3)},${y(value).toFixed(3)}`).join(' ')}"/>${values.map((value, index) => `<circle class="account-analysis-history-point" cx="${x(index)}" cy="${y(value)}" r="3"><title>${esc(months[index].month)} ${esc(t('analysis.through_be6a56', 'through'))} ${esc(months[index].through)} · ${esc(currencyLabel(`${kindLabel(typeKind)} ${noun}`))}: ${esc(money(value))}</title></circle>`).join('')}</g>`;
    });
    return `<section class="recording-section account-analysis-history">${heading}<p class="recording-note analysis-chart-unit">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))}</p><div class="account-analysis-history-scroll" role="region" aria-label="${esc(assets ? t('analysis.assetHistoryChart', 'Monthly assets by account type chart') : t('analysis.liabilityHistoryChart', 'Monthly liabilities by account type chart'))}" tabindex="0"><svg class="account-analysis-history-chart" data-account-history="${kind}" viewBox="0 0 520 218" role="img" aria-labelledby="${titlePrefix}-title ${titlePrefix}-description"><title id="${titlePrefix}-title">${esc(currencyLabel(assets ? t('analysis.recordedAssetHistory', 'Monthly recorded assets by account type') : t('analysis.recordedLiabilityHistory', 'Monthly recorded liabilities by account type')))}</title><desc id="${titlePrefix}-description">${esc(currencyLabel(t('analysis.amount_43dc85', 'Amount')))}. ${esc(t('analysis.historyDescription', '{count} available monthly cutoffs from {from} through {through}. Separate lines show positive recorded {kind} for each selected account type, using current type metadata{atCost}. Exact values appear in {table}.', { count: months.length, from: history.from, through: history.through, kind: noun, atCost: assets ? t('analysis.atCostQualification', ' and holdings at cost') : '', table: tableLabel }))}</desc>${(maximum ? [0, 0.5, 1] : [0]).map((fraction) => `<line class="account-analysis-history-gridline" x1="${left}" x2="${right}" y1="${bottom - (bottom - top) * fraction}" y2="${bottom - (bottom - top) * fraction}"/><text class="account-analysis-history-axis" x="116" y="${bottom - (bottom - top) * fraction + 4}" text-anchor="end">${esc(money(Math.round(maximum * fraction)))}</text>`).join('')}${lines.join('')}${months.map((row, index) => (index % labelStep === 0 || index === months.length - 1 ? `<text class="account-analysis-history-axis" x="${x(index)}" y="202" text-anchor="middle">${esc(row.month)}${index === months.length - 1 && partial ? '*' : ''}</text>` : '')).join('')}</svg></div><ul class="account-analysis-history-legend">${kinds.map((typeKind) => `<li><span class="account-analysis-type-swatch ${typeClass(typeKind)}" aria-hidden="true"></span>${esc(kindLabel(typeKind))}</li>`).join('')}</ul><p class="recording-note">${esc(t('analysis.historyScope', 'Available account history from {from} through {through}. Earlier points use month-end balances.{partial}{zero}', { from: history.from, through: history.through, partial: partial ? t('analysis.partialMonthNote', ' *The final month ends at the selected cutoff, {through}.', { through: history.through }) : '', zero: maximum ? '' : t('analysis.zeroHistoryNote', ' Recorded {kind} were zero at every available cutoff.', { kind: noun }) }))}</p><details class="account-analysis-history-details" id="${historyDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>${tableLabel}</summary><div class="records-surface"><div class="table-scroll" role="region" aria-label="${tableLabel}" tabindex="0"><table><thead><tr><th scope="col">${esc(t('analysis.month_082bc3', 'Month'))}</th><th scope="col">${esc(t('analysis.through_posting_date_47fcd1', 'Through posting date'))}</th>${kinds.map((typeKind) => `<th scope="col" class="table-align-end">${esc(currencyLabel(kindLabel(typeKind)))}</th>`).join('')}<th scope="col" class="table-align-end">${esc(currencyLabel(`${t('analysis.total_b25928', 'Total')} ${noun}`))}</th></tr></thead><tbody>${months.map((row) => `<tr><td>${esc(row.month)}${partialMonth(row) ? t('analysis.partialMonth', ' (partial)') : ''}</td><td>${esc(row.through)}</td>${kinds.map((typeKind) => `<td class="amount">${money(row.types.find((type) => type.kind === typeKind)[metric])}</td>`).join('')}<td class="amount">${money(row[metric])}</td></tr>`).join('')}</tbody></table></div></div></details></section>`;
  }

  const root = $('account-analysis-content');
  const pages = { accounts: { page: 1 }, assets: { page: 1 }, liabilities: { page: 1 } };
  let accountPolicy = null,
    through = '',
    automatic = true,
    topCount = 5,
    allocationDetailsOpen = { assets: false, liabilities: false },
    historyDetailsOpen = { assets: false, liabilities: false },
    resetEpoch = 0,
    filterDialog = null;
  const resetPages = () => {
    for (const state of Object.values(pages)) state.page = 1;
  };
  function reset() {
    resetEpoch++;
    const draft = filterDialog;
    filterDialog = null;
    draft?.close();
    accountPolicy = null;
    through = '';
    automatic = true;
    topCount = 5;
    allocationDetailsOpen = { assets: false, liabilities: false };
    historyDetailsOpen = { assets: false, liabilities: false };
    resetPages();
  }
  function showAccountFilter() {
    filterDialog?.close();
    const snapshot = ctx.getDocument();
    const { dialog } = showSelectionFilter({
      title: t('analysis.select_accounts_for_analysis_a3e867', 'Select accounts for analysis'),
      description: t(
        'analysis.choose_the_accounts_to_include_these_choices_are_independe_a411f0',
        'Choose the accounts to include. These choices are independent of entry selections and Recording filters. Apply filters when ready.',
      ),
      groups: [
        {
          id: 'accounts',
          label: t('analysis.accounts_36bae3', 'Accounts'),
          items: accountChoices(snapshot.ledger.accounts),
          selection: accountPolicy,
        },
      ],
      onApply: (draft) => {
        if (filterDialog !== dialog) return;
        accountPolicy = draft.get('accounts');
        resetPages();
        render();
      },
      onClose: () => {
        if (filterDialog !== dialog) return;
        filterDialog = null;
        if (ctx.isActive?.() !== false) $('account-analysis-filter')?.focus();
      },
    });
    filterDialog = dialog;
  }
  function render() {
    if (!root || ctx.isActive?.() === false) return;
    const snapshot = ctx.getDocument();
    currentPresentation =
      ctx.getPresentation?.() ?? createPresentation({ currency: snapshot.ledger.currency });
    const ledger = snapshot.ledger,
      selected = ledger.accounts.filter(
        (account) => accountPolicy === null || accountPolicy.has(account.id),
      ),
      accountIds = selected.map((account) => account.id);
    if (automatic) {
      const scope = selected.length ? selected : ledger.accounts;
      through =
        scope
          .map((account) => latestAccountDate(ledger, account.id))
          .sort()
          .at(-1) ?? '';
    }
    let report = null,
      error = '';
    if (ledger.accounts.length)
      try {
        report = analyzeAccounts(snapshot, { accountIds, through });
      } catch (failure) {
        error = presentation().error(failure);
      }
    const choices = accountChoices(ledger.accounts),
      labels = new Map(choices.map((choice) => [choice.id, choice.label])),
      byId = new Map(report?.accounts.map((account) => [account.accountId, account]) ?? []),
      rows = choices.map((choice) => byId.get(choice.id)).filter(Boolean),
      selectionLabel =
        accountPolicy === null
          ? t('analysis.all_accounts_6a19f2', 'All accounts')
          : t('analysis.selectedCount', '{count} selected', { count: selected.length });
    root.innerHTML = `<div class="account-analysis-heading"><p class="eyebrow">${esc(t('analysis.analysis_accounts_assets_2d1f90', 'ANALYSIS · ACCOUNTS & ASSETS'))}</p><h1>${esc(t('analysis.account_asset_analysis_de99a0', 'Account & Asset analysis'))}</h1><p class="recording-note">${esc(t('analysis.review_recorded_balances_and_their_distribution_at_one_com_049f70', 'Review recorded balances and their distribution at one common posting-date cutoff.'))}</p></div><div class="recording-toolbar account-analysis-toolbar" aria-label="${esc(t('analysis.account_analysis_scope_043f11', 'Account analysis scope'))}"><div class="recording-filter-control"><span id="account-analysis-filter-label">${esc(t('analysis.accounts_36bae3', 'Accounts'))}</span><button type="button" class="recording-filter-trigger" id="account-analysis-filter" aria-haspopup="dialog" aria-labelledby="account-analysis-filter-label account-analysis-filter-value"${ledger.accounts.length ? '' : ' disabled'}><span id="account-analysis-filter-value">${selectionLabel}</span></button></div><label>${esc(t('analysis.through_posting_date_47fcd1', 'Through posting date'))}<input id="account-analysis-through" type="date" min="0001-01-01" max="9999-12-31" value="${esc(through)}"${ledger.accounts.length ? '' : ' disabled'}${error && !validDate(through) ? ' aria-invalid="true" aria-describedby="account-analysis-error"' : ''}></label><label class="account-analysis-top-control">${esc(t('analysis.top_types_shown_ebcc94', 'Top types shown'))}<select id="account-analysis-top-count"${ledger.accounts.length ? '' : ' disabled'}>${[5, 6, 7, 8].map((count) => `<option value="${count}"${count === topCount ? ' selected' : ''}>${count}</option>`).join('')}</select></label><button type="button" class="button button-outline" id="account-analysis-latest"${ledger.accounts.length ? '' : ' disabled'}>${esc(t('analysis.latest_recorded_date_bb13f4', 'Latest recorded date'))}</button></div><p class="recording-note account-analysis-scope" role="status">${esc(t('analysis.accountScope', '{selected} of {total} accounts selected{cutoff}. This report uses full posting history, independently of Analyze entry selections, presets, and Recording filters.', { selected: selected.length, total: ledger.accounts.length, cutoff: report ? t('analysis.accountCutoff', ' · Through {through}', { through: report.through }) : '' }))}</p>${
      !ledger.accounts.length
        ? `<section class="recording-empty"><h2>${esc(t('analysis.no_accounts_to_analyze_3792bf', 'No accounts to analyze'))}</h2><p>${esc(t('analysis.add_an_account_in_accounts_assets_or_open_a_finance_record_ddb5dc', 'Add an account in Accounts & Assets, or open a Finance Records JSON file. Account balances start at zero and follow recorded postings.'))}</p></section>`
        : error
          ? `<p class="form-error account-analysis-error" id="account-analysis-error" role="alert">${esc(error)}</p>${summaryHTML()}`
          : `${summaryHTML(report)}${selected.length ? '' : `<p class="recording-note account-analysis-empty" role="status">${esc(t('analysis.no_accounts_selected_totals_are_zero_and_allocation_percen_3423b1', 'No accounts selected. Totals are zero and allocation percentages are unavailable.'))}</p>`}<p class="recording-note account-analysis-qualification">${esc(t('analysis.postingUncertainty', '{count} included posting {dateVerb} marked unconfirmed. Balances use those dates as recorded. Latest recorded date uses the last saved posting or account-opening date in the selected scope, or all accounts when none are selected.', { count: report.postedDateUnconfirmedCount, dateVerb: report.postedDateUnconfirmedCount === 1 ? t('analysis.date_is_0a76d6', 'date is') : t('analysis.dates_are_050d7a', 'dates are') }))}</p>${accountColumns(report, pages, historyDetailsOpen, topCount, allocationDetailsOpen)}<section class="recording-section"><div class="recording-table-heading"><h2>${esc(t('analysis.selected_accounts_18d7e6', 'Selected accounts'))}</h2><span class="scope-note">${esc(t('analysis.account.currency', 'Recorded values · {currency}', { currency: presentation().currency }))}</span></div>${tableHTML(
              'account-analysis-accounts',
              [
                t('analysis.account_85dfa3', 'Account'),
                {
                  label: t('analysis.cash_balance_d88b90', 'Cash balance'),
                  align: 'end',
                  monetary: true,
                },
                {
                  label: t('analysis.holdings_at_cost_42323d', 'Holdings at cost'),
                  align: 'end',
                  monetary: true,
                },
                {
                  label: t('analysis.recorded_balance_e07e56', 'Recorded balance'),
                  align: 'end',
                  monetary: true,
                },
                { label: t('analysis.assets_20e338', 'Assets'), align: 'end', monetary: true },
                {
                  label: t('analysis.liabilities_556a42', 'Liabilities'),
                  align: 'end',
                  monetary: true,
                },
              ],
              rows,
              (account) =>
                `<tr><td>${esc(labels.get(account.accountId))}</td><td class="amount">${account.cashBalanceCents === null ? '—' : money(account.cashBalanceCents)}</td><td class="amount">${account.kind === 'investment' ? money(account.holdingsCostCents) : '—'}</td><td class="amount${account.bookBalanceCents < 0 ? ' negative' : ''}">${money(account.bookBalanceCents)}</td><td class="amount">${money(account.assetsCents)}</td><td class="amount">${money(account.liabilitiesCents)}</td></tr>`,
              pages.accounts,
              PAGE_SIZE,
              t('analysis.no_accounts_selected_d3d725', 'No accounts selected.'),
            )}</section><p class="recording-note account-analysis-basis">${esc(t('analysis.investment_recorded_balance_equals_cash_plus_active_holdin_972eb3', 'Investment recorded balance equals cash plus active holdings at purchase cost; these components are counted once. Values are recorded amounts, not market prices or accrued interest. Positive balances are assets and negative balances are liabilities, split per account before grouping. Credit-card credit balances are assets; card debt is a liability.'))}</p><p class="recording-note account-analysis-basis">${esc(t('analysis.types_and_closed_labels_use_current_saved_account_metadata_f5ebae', 'Types and Closed labels use current saved account metadata. Closed accounts retain their histories; accounts not yet opened at the cutoff contribute zero. Each transfer leg uses its own posting date, so posting gaps can temporarily change combined recorded balances.'))}</p>`
    }`;
    $('account-analysis-filter').addEventListener('click', showAccountFilter);
    $('account-analysis-through').addEventListener('change', () => {
      const focused = document.activeElement?.id;
      through = $('account-analysis-through').value;
      automatic = false;
      resetPages();
      render();
      if (focused === 'account-analysis-through') $('account-analysis-through')?.focus();
    });
    $('account-analysis-top-count').addEventListener('change', () => {
      const requested = Number($('account-analysis-top-count').value);
      if ([5, 6, 7, 8].includes(requested)) topCount = requested;
      pages.assets.page = pages.liabilities.page = 1;
      render();
      $('account-analysis-top-count')?.focus();
    });
    $('account-analysis-latest').addEventListener('click', () => {
      automatic = true;
      resetPages();
      render();
      $('account-analysis-latest')?.focus();
    });
    if (!report) return;
    const epoch = resetEpoch;
    for (const kind of ['assets', 'liabilities']) {
      for (const [id, state] of [
        [historyDetailsId(kind), historyDetailsOpen],
        [allocationDetailsId(kind), allocationDetailsOpen],
      ]) {
        const details = $(id);
        details?.addEventListener('toggle', () => {
          if (epoch === resetEpoch && details.isConnected) state[kind] = details.open;
        });
      }
    }
    bindPager(root, 'account-analysis-accounts', rows.length, pages.accounts, PAGE_SIZE, render);
    for (const kind of ['assets', 'liabilities'])
      bindPager(
        root,
        `account-analysis-${kind}-types`,
        report.types.length,
        pages[kind],
        FULL_TYPE_PAGE_SIZE,
        render,
      );
  }
  return { render, reset };
}
