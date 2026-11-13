import { analyzeAccounts } from '../analysis/account-analysis.mjs';
import { latestAccountDate } from '../core/account-ledger.mjs';
import { validDate } from '../core/values.mjs';
import {
  $,
  esc,
  money,
  accountChoices,
  kindLabel,
  showSelectionFilter,
  tableHTML,
  bindPager,
} from './shared-controls.mjs';

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
    ['Recorded assets', 'assetsCents', 'Positive recorded account balances'],
    ['Liabilities', 'liabilitiesCents', 'Negative recorded account balances'],
    ['Recorded net assets', 'netAssetsCents', 'Recorded assets minus liabilities'],
  ]
    .map(
      ([label, key, caption]) =>
        `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value" data-account-analysis-total="${key}">${report ? money(report[key]) : '—'}</strong><span class="stat-caption">${report ? caption : 'Correct the report inputs'}</span></div>`,
    )
    .join('')}</div>`;
}

const typeHeadings = [
  'Account type',
  { label: 'Selected accounts', align: 'end' },
  { label: 'Amount', align: 'end' },
  { label: 'Share', align: 'end' },
];
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
    return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${key}" tabindex="0"><table><thead><tr>${typeHeadings.map((heading) => `<th scope="col" class="table-align-${typeof heading === 'string' ? 'start' : heading.align}">${typeof heading === 'string' ? heading : heading.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => distributionRow(kind, row)).join('') || '<tr><td colspan="4" class="table-empty">No selected account types.</td></tr>'}</tbody></table></div></div>`;
  return tableHTML(
    key,
    typeHeadings,
    rows,
    (row) => distributionRow(kind, row),
    state,
    FULL_TYPE_PAGE_SIZE,
    'No selected account types.',
  );
}

function distributionPie(kind, report, rankedRows) {
  const assets = kind === 'assets',
    amountKey = assets ? 'assetsCents' : 'liabilitiesCents',
    shareKey = assets ? 'assetShare' : 'liabilityShare',
    total = report[amountKey],
    rows = rankedRows.filter((row) => row[amountKey] > 0),
    title = assets ? 'Assets by account type' : 'Liabilities by account type';
  if (!total)
    return `<div class="account-analysis-pie-empty" role="status">${assets ? 'No positive recorded assets at this cutoff.' : 'No recorded liabilities at this cutoff.'} No allocation pie is available.</div>`;
  const remaining = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row[amountKey]), 0n);
  if (remaining > 0n)
    rows.push({
      kind: 'other',
      [amountKey]: Number(remaining),
      [shareKey]: Number(remaining) / total,
    });
  const label = (row) => (row.kind === 'other' ? 'Other' : kindLabel(row.kind));
  let angle = -Math.PI / 2;
  const point = (value) =>
    `${(120 + 96 * Math.cos(value)).toFixed(6)} ${(120 + 96 * Math.sin(value)).toFixed(6)}`;
  const slices = rows.map((row, index) => {
    const start = angle;
    angle = index === rows.length - 1 ? Math.PI * 1.5 : angle + row[shareKey] * Math.PI * 2;
    const caption = `${label(row)}: ${money(row[amountKey])} (${percent(row[shareKey])})`;
    return rows.length === 1
      ? `<circle class="account-analysis-pie-slice ${typeClass(row.kind)}" data-account-pie-kind="${esc(row.kind)}" cx="120" cy="120" r="96"><title>${esc(caption)}</title></circle>`
      : `<path class="account-analysis-pie-slice ${typeClass(row.kind)}" data-account-pie-kind="${esc(row.kind)}" d="M120 120 L${point(start)} A96 96 0 0 1 ${point((start + angle) / 2)} A96 96 0 0 1 ${point(angle)} Z"><title>${esc(caption)}</title></path>`;
  });
  return `<figure class="account-analysis-pie-figure"><svg class="account-analysis-pie" data-account-pie="${kind}" viewBox="0 0 240 240" role="img" aria-labelledby="account-${kind}-pie-title account-${kind}-pie-description"><title id="account-${kind}-pie-title">${title}</title><desc id="account-${kind}-pie-description">${rows.length} positive account-type ${rows.length === 1 ? 'slice' : 'slices'}, totaling ${esc(money(total))}, through ${esc(report.through)}. Exact amounts and shares appear in the legend and corresponding table.</desc>${slices.join('')}</svg><figcaption>${assets ? 'Recorded assets' : 'Liabilities'}: <strong>${money(total)}</strong></figcaption><ul class="account-analysis-pie-legend">${rows.map((row) => `<li><span class="account-analysis-type-swatch ${typeClass(row.kind)}" aria-hidden="true"></span><span>${esc(label(row))}</span><span class="account-analysis-legend-amount">${money(row[amountKey])}</span><span class="account-analysis-legend-share">${esc(percent(row[shareKey]))}</span></li>`).join('')}</ul></figure>`;
}

const allocationDetailsId = (kind) => `account-analysis-${kind}-all-types`;
function distributionSection(kind, report, page, topCount, detailsOpen) {
  const assets = kind === 'assets',
    rows = rankedTypes(kind, report.types, topCount);
  return `<section class="recording-section account-analysis-allocation"><div class="recording-table-heading"><h3>${assets ? 'Assets' : 'Liabilities'} by account type</h3><span class="scope-note">Share of ${assets ? 'recorded assets' : 'liabilities'}</span></div><div class="account-analysis-distribution"><div class="account-analysis-pie-panel">${distributionPie(kind, report, rows)}</div><div class="account-analysis-distribution-table"><p class="recording-note account-analysis-ranked-label">Top ${rows.length} available types · Ranked by share</p>${distributionTable(kind, rows, null, true)}</div></div><details class="account-analysis-all-types account-analysis-allocation-details" id="${allocationDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>All ${assets ? 'asset' : 'liability'} types</summary><p class="recording-note">All selected account types in their original type order.</p>${distributionTable(kind, report.types, page)}</details></section>`;
}

const historyDetailsId = (kind) =>
  kind === 'assets'
    ? 'account-analysis-history-details'
    : 'account-analysis-liabilities-history-details';

function accountColumns(report, pages, detailsOpen, topCount, allTypesOpen) {
  return `<div class="account-analysis-columns">${['assets', 'liabilities'].map((kind) => `<section class="account-analysis-column" data-account-side="${kind}" aria-labelledby="account-${kind}-column-heading"><h2 id="account-${kind}-column-heading">${kind === 'assets' ? 'Assets' : 'Liabilities'}</h2>${historyHTML(kind, report, detailsOpen[kind])}${distributionSection(kind, report, pages[kind], topCount, allTypesOpen[kind])}</section>`).join('')}</div>`;
}

function historyHTML(kind, report, detailsOpen) {
  const { history } = report;
  const assets = kind === 'assets',
    metric = assets ? 'assetsCents' : 'liabilitiesCents',
    noun = assets ? 'assets' : 'liabilities',
    singular = assets ? 'asset' : 'liability',
    titlePrefix = assets ? 'account-history' : 'account-liabilities-history',
    tableLabel = `Monthly ${singular} values`,
    heading = `<div class="recording-table-heading"><h3>Monthly ${noun} by account type</h3><span class="scope-note">Posting dates · Up to 12 months</span></div>`;
  if (history.error)
    return `<section class="recording-section account-analysis-history">${heading}<p class="form-error" role="alert">${esc(history.error)}</p><p class="recording-note">The current-cutoff totals and allocation tables remain available below.</p></section>`;
  if (!history.months.length)
    return `<section class="recording-section account-analysis-history">${heading}<p class="recording-note">No selected accounts were open on or before this cutoff.</p></section>`;
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
    return `<g class="${typeClass(typeKind)}"><polyline class="account-analysis-history-line" data-account-history-series="${esc(typeKind)}" points="${values.map((value, index) => `${x(index).toFixed(3)},${y(value).toFixed(3)}`).join(' ')}"/>${values.map((value, index) => `<circle class="account-analysis-history-point" cx="${x(index)}" cy="${y(value)}" r="3"><title>${esc(months[index].month)} through ${esc(months[index].through)} · ${esc(kindLabel(typeKind))} ${noun}: ${esc(money(value))}</title></circle>`).join('')}</g>`;
  });
  return `<section class="recording-section account-analysis-history">${heading}<div class="account-analysis-history-scroll" role="region" aria-label="Monthly ${noun} by account type chart" tabindex="0"><svg class="account-analysis-history-chart" data-account-history="${kind}" viewBox="0 0 520 218" role="img" aria-labelledby="${titlePrefix}-title ${titlePrefix}-description"><title id="${titlePrefix}-title">Monthly recorded ${noun} by account type</title><desc id="${titlePrefix}-description">${months.length} available monthly cutoffs from ${esc(history.from)} through ${esc(history.through)}. Separate lines show positive recorded ${noun} for each selected account type, using current type metadata${assets ? ' and holdings at cost' : ''}. Exact values appear in ${tableLabel}.</desc>${(maximum ? [0, 0.5, 1] : [0]).map((fraction) => `<line class="account-analysis-history-gridline" x1="${left}" x2="${right}" y1="${bottom - (bottom - top) * fraction}" y2="${bottom - (bottom - top) * fraction}"/><text class="account-analysis-history-axis" x="116" y="${bottom - (bottom - top) * fraction + 4}" text-anchor="end">${esc(money(Math.round(maximum * fraction)))}</text>`).join('')}${lines.join('')}${months.map((row, index) => (index % labelStep === 0 || index === months.length - 1 ? `<text class="account-analysis-history-axis" x="${x(index)}" y="202" text-anchor="middle">${esc(row.month)}${index === months.length - 1 && partial ? '*' : ''}</text>` : '')).join('')}</svg></div><ul class="account-analysis-history-legend">${kinds.map((typeKind) => `<li><span class="account-analysis-type-swatch ${typeClass(typeKind)}" aria-hidden="true"></span>${esc(kindLabel(typeKind))}</li>`).join('')}</ul><p class="recording-note">Available account history from ${esc(history.from)} through ${esc(history.through)}. Earlier points use month-end balances.${partial ? ` *The final month ends at the selected cutoff, ${esc(history.through)}.` : ''}${maximum ? '' : ` Recorded ${noun} were zero at every available cutoff.`}</p><details class="account-analysis-history-details" id="${historyDetailsId(kind)}"${detailsOpen ? ' open' : ''}><summary>${tableLabel}</summary><div class="records-surface"><div class="table-scroll" role="region" aria-label="${tableLabel}" tabindex="0"><table><thead><tr><th scope="col">Month</th><th scope="col">Through posting date</th>${kinds.map((typeKind) => `<th scope="col" class="table-align-end">${esc(kindLabel(typeKind))}</th>`).join('')}<th scope="col" class="table-align-end">Total ${noun}</th></tr></thead><tbody>${months.map((row) => `<tr><td>${esc(row.month)}${partialMonth(row) ? ' (partial)' : ''}</td><td>${esc(row.through)}</td>${kinds.map((typeKind) => `<td class="amount">${money(row.types.find((type) => type.kind === typeKind)[metric])}</td>`).join('')}<td class="amount">${money(row[metric])}</td></tr>`).join('')}</tbody></table></div></div></details></section>`;
}

export function createAccountAnalysisUI(ctx) {
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
      title: 'Select accounts for analysis',
      description:
        'Choose the accounts to include. These choices are independent of entry selections and Recording filters. Apply filters when ready.',
      groups: [
        {
          id: 'accounts',
          label: 'Accounts',
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
    const snapshot = ctx.getDocument(),
      ledger = snapshot.ledger,
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
        error = failure.message || 'The selected accounts could not be analyzed.';
      }
    const choices = accountChoices(ledger.accounts),
      labels = new Map(choices.map((choice) => [choice.id, choice.label])),
      byId = new Map(report?.accounts.map((account) => [account.accountId, account]) ?? []),
      rows = choices.map((choice) => byId.get(choice.id)).filter(Boolean),
      selectionLabel = accountPolicy === null ? 'All accounts' : `${selected.length} selected`;
    root.innerHTML = `<div class="account-analysis-heading"><p class="eyebrow">ANALYSIS · ACCOUNTS & ASSETS</p><h1>Account & Asset analysis</h1><p class="recording-note">Review recorded balances and their distribution at one common posting-date cutoff.</p></div><div class="recording-toolbar account-analysis-toolbar" aria-label="Account analysis scope"><div class="recording-filter-control"><span id="account-analysis-filter-label">Accounts</span><button type="button" class="recording-filter-trigger" id="account-analysis-filter" aria-haspopup="dialog" aria-labelledby="account-analysis-filter-label account-analysis-filter-value"${ledger.accounts.length ? '' : ' disabled'}><span id="account-analysis-filter-value">${selectionLabel}</span></button></div><label>Through posting date<input id="account-analysis-through" type="date" min="0001-01-01" max="9999-12-31" value="${esc(through)}"${ledger.accounts.length ? '' : ' disabled'}${error && !validDate(through) ? ' aria-invalid="true" aria-describedby="account-analysis-error"' : ''}></label><label class="account-analysis-top-control">Top types shown<select id="account-analysis-top-count"${ledger.accounts.length ? '' : ' disabled'}>${[5, 6, 7, 8].map((count) => `<option value="${count}"${count === topCount ? ' selected' : ''}>${count}</option>`).join('')}</select></label><button type="button" class="button button-outline" id="account-analysis-latest"${ledger.accounts.length ? '' : ' disabled'}>Latest recorded date</button></div><p class="recording-note account-analysis-scope" role="status">${selected.length} of ${ledger.accounts.length} accounts selected${report ? ` · Through ${esc(report.through)}` : ''}. This report uses full posting history, independently of Analyze entry selections, presets, and Recording filters.</p>${
      !ledger.accounts.length
        ? '<section class="recording-empty"><h2>No accounts to analyze</h2><p>Add an account in Accounts & Assets, or open a Finance Records JSON file. Account balances start at zero and follow recorded postings.</p></section>'
        : error
          ? `<p class="form-error account-analysis-error" id="account-analysis-error" role="alert">${esc(error)}</p>${summaryHTML()}`
          : `${summaryHTML(report)}${selected.length ? '' : '<p class="recording-note account-analysis-empty" role="status">No accounts selected. Totals are zero and allocation percentages are unavailable.</p>'}<p class="recording-note account-analysis-qualification">${report.postedDateUnconfirmedCount} included posting ${report.postedDateUnconfirmedCount === 1 ? 'date is' : 'dates are'} marked unconfirmed. Balances use those dates as recorded. Latest recorded date uses the last saved posting or account-opening date in the selected scope, or all accounts when none are selected.</p>${accountColumns(report, pages, historyDetailsOpen, topCount, allocationDetailsOpen)}<section class="recording-section"><div class="recording-table-heading"><h2>Selected accounts</h2><span class="scope-note">Recorded values · USD</span></div>${tableHTML(
              'account-analysis-accounts',
              [
                'Account',
                { label: 'Cash balance', align: 'end' },
                { label: 'Holdings at cost', align: 'end' },
                { label: 'Recorded balance', align: 'end' },
                { label: 'Assets', align: 'end' },
                { label: 'Liabilities', align: 'end' },
              ],
              rows,
              (account) =>
                `<tr><td>${esc(labels.get(account.accountId))}</td><td class="amount">${account.cashBalanceCents === null ? '—' : money(account.cashBalanceCents)}</td><td class="amount">${account.kind === 'investment' ? money(account.holdingsCostCents) : '—'}</td><td class="amount${account.bookBalanceCents < 0 ? ' negative' : ''}">${money(account.bookBalanceCents)}</td><td class="amount">${money(account.assetsCents)}</td><td class="amount">${money(account.liabilitiesCents)}</td></tr>`,
              pages.accounts,
              PAGE_SIZE,
              'No accounts selected.',
            )}</section><p class="recording-note account-analysis-basis">Investment recorded balance equals cash plus active holdings at purchase cost; these components are counted once. Values are recorded amounts, not market prices or accrued interest. Positive balances are assets and negative balances are liabilities, split per account before grouping. Credit-card credit balances are assets; card debt is a liability.</p><p class="recording-note account-analysis-basis">Types and Closed labels use current saved account metadata. Closed accounts retain their histories; accounts not yet opened at the cutoff contribute zero. Each transfer leg uses its own posting date, so posting gaps can temporarily change combined recorded balances.</p>`
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
