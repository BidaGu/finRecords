import { orderedEntries } from '../core/records.mjs';
import {
  $,
  esc,
  money,
  amount,
  parseMoney,
  newId,
  accountLabel,
  accountChoices,
  accountOptions,
  options,
  field,
  moneyField,
  selectField,
  noteField,
  datesHTML,
  readDates,
  dateCell,
  actionButton,
  showForm,
  showSelectionFilter,
  confirmAction,
  tableHTML,
  bindPager,
  totalsHTML,
} from './shared-controls.mjs';

export function createRecordsUI(ctx) {
  const root = $('records-content'),
    page = { page: 1 };
  const defaultFilters = () => ({
    q: '',
    categories: { gain: null, expense: null },
    month: '',
    accounts: null,
    from: '',
    through: '',
  });
  const filters = defaultFilters();
  let dragged = null,
    filterDialog = null;
  const ledger = () => ctx.getDocument().ledger;
  const cats = (kind) =>
    ledger()
      .categories.filter((c) => c.kind === kind)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
  const byId = (list, id) => list.find((item) => item.id === id);
  function allOrdered() {
    const document = ctx.getDocument();
    return orderedEntries(document.ledger, document.settings.recordOrder);
  }
  function matching() {
    const l = ledger();
    return allOrdered().filter(
      (e) =>
        (filters.categories[e.kind] === null || filters.categories[e.kind].has(e.categoryId)) &&
        (filters.accounts === null || filters.accounts.has(e.accountId)) &&
        (!filters.month || e.activityDate.startsWith(filters.month)) &&
        (!filters.from || e.activityDate >= filters.from) &&
        (!filters.through || e.activityDate <= filters.through) &&
        (!ctx.selection.includedOnly || ctx.selection.has(e.id)) &&
        (!filters.q ||
          [
            e.merchant,
            e.note,
            byId(l.categories, e.categoryId)?.label,
            byId(l.accounts, e.accountId)?.name,
          ]
            .join(' ')
            .toLowerCase()
            .includes(filters.q.toLowerCase())),
    );
  }
  function openSelectionFilter({ triggerId, onApply, ...config }) {
    filterDialog?.close();
    const { dialog } = showSelectionFilter({
      ...config,
      onApply: (draft) => {
        onApply(draft);
        page.page = 1;
        ctx.render();
      },
      onClose: () => {
        if (filterDialog !== dialog) return;
        filterDialog = null;
        $(triggerId)?.focus();
      },
    });
    filterDialog = dialog;
  }
  function showCategoryFilter() {
    openSelectionFilter({
      title: 'Types & Categories',
      description:
        'Choose categories within Gains and Expenses. Deselect all in a group to exclude that type. Apply filters when ready.',
      groups: [
        { id: 'gain', label: 'Gains', items: cats('gain'), selection: filters.categories.gain },
        {
          id: 'expense',
          label: 'Expenses',
          items: cats('expense'),
          selection: filters.categories.expense,
        },
      ],
      triggerId: 'record-category-filter',
      onApply: (draft) => {
        filters.categories = { gain: draft.get('gain'), expense: draft.get('expense') };
      },
    });
  }
  function showAccountFilter() {
    openSelectionFilter({
      title: 'Filter accounts',
      description: 'Choose one or more accounts. Apply filters when ready.',
      groups: [
        {
          id: 'accounts',
          label: 'Accounts',
          items: accountChoices(ledger().accounts),
          selection: filters.accounts,
        },
      ],
      triggerId: 'record-account-filter',
      onApply: (draft) => {
        filters.accounts = draft.get('accounts');
      },
    });
  }
  function showEntry(id = null, { copy = false, draft = null } = {}) {
    const original = id ? byId(ledger().entries, id) : null;
    const value = draft ??
      original ?? {
        kind: cats('expense').length ? 'expense' : cats('gain').length ? 'gain' : 'expense',
      };
    const kind = value.kind ?? 'expense';
    const content = `<fieldset class="type-switch"><legend class="sr-only">Entry type</legend><label><input type="radio" name="kind" value="gain"${kind === 'gain' ? ' checked' : ''}><span>Gain</span></label><label><input type="radio" name="kind" value="expense"${kind === 'expense' ? ' checked' : ''}><span>Expense</span></label></fieldset>${datesHTML(value, 'entry-')}<p class="cash-dialog-help">Activity date records when the gain or expense happened. Posting date determines when the account balance changes.</p>${selectField(
      'Category',
      'categoryId',
      options(
        cats(kind).map((c) => ({ ...c, name: c.label })),
        value.categoryId,
        'Choose a category',
      ),
    )}<button class="inline-category-button" type="button" data-manage-categories>Manage categories</button>${selectField(
      'Account',
      'accountId',
      accountOptions(ledger().accounts, value.accountId ?? ctx.accountId, 'Choose an account'),
    )}${moneyField('Amount ($)', 'amount', value.amountCents ? amount(value.amountCents) : '', { required: true, attrs: 'autocomplete="off"' })}${field('Merchant or source', 'merchant', value.merchant ?? '', { attrs: 'maxlength="200" autocomplete="off"' })}${noteField(value.note ?? '')}`;
    const { dialog, form } = showForm({
      title: copy ? 'Duplicate entry' : original ? 'Edit entry' : 'Add an entry',
      content,
      submitLabel: copy ? 'Create copy' : original ? 'Save changes' : 'Add entry',
      onSave: (f, d) => {
        const next = {
          ...(copy ? {} : (original ?? {})),
          id: copy ? newId('entry') : (original?.id ?? newId('entry')),
          kind: f.elements.kind.value,
          ...readDates(f, 'entry-'),
          categoryId: f.elements.categoryId.value,
          accountId: f.elements.accountId.value,
          amountCents: parseMoney(f.elements.amount.value),
          merchant: f.elements.merchant.value.trim(),
          note: f.elements.note.value.trim(),
          updatedAt: undefined,
        };
        ctx.command(
          copy
            ? { type: 'entry.copy', id: original.id, value: next }
            : { type: 'entry.save', value: next },
        );
        d.close();
      },
    });
    const refreshCategories = () => {
      const current = form.elements.categoryId.value;
      form.elements.categoryId.innerHTML = options(
        cats(form.elements.kind.value).map((c) => ({ ...c, name: c.label })),
        current,
        'Choose a category',
      );
    };
    form
      .querySelectorAll('[name=kind]')
      .forEach((radio) => radio.addEventListener('change', refreshCategories));
    form
      .querySelector('[data-manage-categories]')
      .addEventListener('click', () => showCategories(refreshCategories));
    return { dialog, form };
  }
  function showCategories(onClose) {
    let kind = 'expense';
    const { dialog, form, showError } = showForm({
      title: 'Categories',
      content: `<p class="cash-dialog-help">Create and manage your own categories. Categories keep their stable IDs when renamed.</p><div class="category-kind-switch"><button type="button" data-category-kind="gain">Gains</button><button type="button" data-category-kind="expense">Expenses</button></div><div data-category-list></div><div class="form-grid category-add-row">${field('New category', 'label', '', { attrs: 'maxlength="80"' })}<button type="button" class="button button-outline" data-category-add>Add category</button></div>`,
      submitLabel: 'Done',
      onSave: (_f, d) => d.close(),
      onClose,
    });
    const renderList = () => {
      form
        .querySelectorAll('[data-category-kind]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.categoryKind === kind)));
      form.querySelector('[data-category-list]').innerHTML =
        cats(kind)
          .map(
            (c) =>
              `<div class="category-edit-row"><span>${esc(c.label)} <small class="muted">(${ledger().entries.filter((e) => e.categoryId === c.id).length} entries)</small></span><button class="button button-outline" type="button" data-category-rename="${esc(c.id)}">Rename</button><button class="button button-quiet recording-danger" type="button" data-category-delete="${esc(c.id)}">Remove</button></div>`,
          )
          .join('') || '<p class="recording-note">No categories in this type yet.</p>';
    };
    form.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      try {
        if (button.dataset.categoryKind) {
          kind = button.dataset.categoryKind;
          renderList();
        }
        if (button.hasAttribute('data-category-add')) {
          const label = form.elements.label.value.trim();
          if (!label) throw new Error('Enter a category name.');
          ctx.command({ type: 'category.save', value: { id: newId('category'), kind, label } });
          form.elements.label.value = '';
          renderList();
          onClose?.();
        }
        if (button.dataset.categoryRename) {
          const item = byId(ledger().categories, button.dataset.categoryRename);
          showForm({
            title: 'Rename category',
            content: field('Category name', 'label', item.label, {
              required: true,
              attrs: 'maxlength="80"',
            }),
            onSave: (f, d) => {
              ctx.command({
                type: 'category.save',
                value: { ...item, label: f.elements.label.value.trim(), updatedAt: undefined },
              });
              d.close();
              renderList();
              onClose?.();
            },
          });
        }
        if (button.dataset.categoryDelete) {
          const item = byId(ledger().categories, button.dataset.categoryDelete),
            used = ledger().entries.some((e) => e.categoryId === item.id);
          const others = cats(item.kind).filter((c) => c.id !== item.id);
          showForm({
            title: 'Remove category?',
            content: `<p class="recording-note">${esc(item.label)}${used ? ' contains entries. Choose a replacement category.' : ' has no entries.'}</p>${used ? selectField('Replacement category', 'replacementId', options(others.map((c) => ({ ...c, name: c.label })))) : ''}`,
            submitLabel: 'Remove category',
            onSave: (f, d) => {
              ctx.command({
                type: 'category.delete',
                id: item.id,
                replacementId: used ? f.elements.replacementId.value : undefined,
              });
              d.close();
              renderList();
              onClose?.();
            },
          });
        }
      } catch (error) {
        showError(error);
      }
    });
    form.elements.label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        form.querySelector('[data-category-add]').click();
      }
    });
    renderList();
    return dialog;
  }
  function reorder(id, targetId) {
    if (id === targetId) return;
    const ids = allOrdered().map((e) => e.id),
      from = ids.indexOf(id);
    ids.splice(from, 1);
    const at = ids.indexOf(targetId);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    ctx.command({ type: 'entries.reorder', ids });
  }
  function move(id, direction) {
    const list = matching(),
      at = list.findIndex((e) => e.id === id);
    let index =
      direction === 'home'
        ? 0
        : direction === 'end'
          ? list.length - 1
          : at + (direction === 'up' ? -1 : 1);
    index = Math.max(0, Math.min(index, list.length - 1));
    if (index === at) return;
    const ids = allOrdered().map((e) => e.id),
      a = ids.indexOf(id),
      b = ids.indexOf(list[index].id);
    const [moved] = ids.splice(a, 1);
    ids.splice(b, 0, moved);
    ctx.command({ type: 'entries.reorder', ids });
  }
  function render() {
    ctx.selection.ensureDocument();
    const l = ledger(),
      active = document.activeElement,
      focusId = active?.id,
      selectionStart = active?.selectionStart;
    const invalid = filters.from && filters.through && filters.from > filters.through;
    const entries = invalid ? [] : matching();
    const categoryCount = l.categories.filter(
      (category) =>
        filters.categories[category.kind] === null ||
        filters.categories[category.kind].has(category.id),
    ).length;
    const categorySummary =
      filters.categories.gain === null && filters.categories.expense === null
        ? 'All types & categories'
        : categoryCount
          ? `${categoryCount} of ${l.categories.length} categories`
          : 'None selected';
    const accountCount = l.accounts.filter(
      (account) => filters.accounts === null || filters.accounts.has(account.id),
    ).length;
    const accountSummary =
      filters.accounts === null
        ? 'All accounts'
        : accountCount
          ? `${accountCount} of ${l.accounts.length} selected`
          : 'No accounts';
    const filterTrigger = (label, id, summary) =>
      `<div class="recording-filter-control"><span id="${id}-label">${esc(label)}</span><button class="recording-filter-trigger" id="${id}" type="button" aria-haspopup="dialog" aria-labelledby="${id}-label ${id}-summary"><span id="${id}-summary">${esc(summary)}</span></button></div>`;
    root.innerHTML = `<section class="records-overview"><div class="section-heading"><div><p class="eyebrow">THE EVERYDAY LEDGER</p><h1>Income &amp; Expenses</h1><p class="lead">Manage your records and select entries for entry analysis.</p></div><div class="section-actions"><button id="manage-categories" class="button button-outline" type="button">Categories</button><button id="add-entry" class="button button-primary" type="button">＋ Add entry</button></div></div>${totalsHTML(entries, { available: !invalid })}</section><section class="records-section"><div class="records-section-heading"><div><h2>Entries <span class="count-pill">${l.entries.length} entries</span></h2><p class="reorder-hint">Drag a handle to reorder. Use ↑/↓ when focused.</p></div><div class="records-order-tools"><span>${ctx.getDocument().settings.recordOrder === 'custom' ? 'Custom order' : 'Newest activity first'}</span><button id="reset-order" class="reset-order" type="button">Sort by activity date</button></div></div><div class="recording-toolbar" role="search" aria-label="Filter entries"><label class="search-grow">Search<input id="record-search" type="search" value="${esc(filters.q)}" placeholder="Search entries…"></label>${filterTrigger('Types & Categories', 'record-category-filter', categorySummary)}<label>Month<input id="record-month" type="month" value="${esc(filters.month)}"></label>${filterTrigger('Accounts', 'record-account-filter', accountSummary)}<label>Start activity date<input id="record-from" type="date" value="${esc(filters.from)}"></label><label>End activity date<input id="record-through" type="date" value="${esc(filters.through)}"></label><button id="record-reset" class="button button-quiet" type="button">Reset</button></div>${invalid ? '<p class="form-error" role="alert">Start date must not be after end date.</p>' : ''}<div class="analysis-selection-toolbar"><div class="recording-selection"><span>${ctx.selection.count} of ${l.entries.length} entries included</span><label><input id="record-included-only" type="checkbox"${ctx.selection.includedOnly ? ' checked' : ''}>Show included only</label></div><div class="analysis-selection-actions"><button id="record-include-all" class="button button-outline" type="button">Include all records</button><button id="record-exclude-all" class="button button-quiet" type="button">Exclude all records</button><button id="assign-filtered" class="button button-outline" type="button"${entries.length ? '' : ' disabled'}>Assign filtered entries…</button></div></div><p class="analysis-selection-help">Checked entry selections can be saved as named presets. Filtering uses activity dates; balances use posting dates.</p>${tableHTML(
      'entries',
      [
        {
          label:
            '<label class="analysis-column-toggle">Analyze<input id="analysis-select-filtered" type="checkbox" aria-label="Select all filtered entries"></label>',
          align: 'center',
        },
        { label: 'Order', align: 'center' },
        'Activity date',
        'Type',
        'Category',
        'Account',
        'Merchant or source',
        'Note',
        { label: 'Amount', align: 'end' },
        { label: 'Actions', align: 'end' },
      ],
      entries,
      (e) => {
        const category = byId(l.categories, e.categoryId),
          account = byId(l.accounts, e.accountId),
          related = l.investmentActivities.find((a) => a.resultEntryId === e.id),
          statement = l.statements.find((s) => s.expenseEntryIds.includes(e.id));
        return `<tr class="recording-entry-row" data-entry-row="${esc(e.id)}"><td><input type="checkbox" data-selection="${esc(e.id)}" aria-label="Analyze ${esc(e.merchant || e.note || e.activityDate)}"${ctx.selection.has(e.id) ? ' checked' : ''}></td><td><button class="reorder-handle" type="button" draggable="true" data-grip="${esc(e.id)}" aria-label="Reorder entry; use arrow keys">⠿</button></td><td>${dateCell(e)}</td><td><span class="type-badge ${e.kind}">${e.kind === 'gain' ? 'Gain' : 'Expense'}</span></td><td>${esc(category?.label)}</td><td>${esc(accountLabel(account))}</td><td>${esc(e.merchant)}</td><td>${esc(e.note)}</td><td class="amount ${e.kind === 'gain' ? 'positive' : 'negative'}">${money(e.amountCents)}</td><td><div class="recording-actions">${actionButton('Edit', `data-edit="${esc(e.id)}"`)}${actionButton('Duplicate', `data-copy="${esc(e.id)}"`)}${actionButton('Delete', `data-delete="${esc(e.id)}"`)}${related ? actionButton('Investment activity', `data-investment="${esc(related.id)}"`) : ''}${statement ? actionButton('Statement', `data-statement="${esc(statement.id)}"`) : ''}</div></td></tr>`;
      },
      page,
      20,
      l.entries.length
        ? 'No entries match these filters.'
        : 'Create an account and categories, then add your first entry.',
    )}</section>`;
    bindPager(root, 'entries', entries.length, page, 20, render);
    const header = $('analysis-select-filtered');
    header.checked = entries.length > 0 && entries.every((e) => ctx.selection.has(e.id));
    header.indeterminate = entries.some((e) => ctx.selection.has(e.id)) && !header.checked;
    if (focusId && $(focusId)) {
      const input = $(focusId);
      input.focus({ preventScroll: true });
      try {
        if (selectionStart !== null) input.setSelectionRange(selectionStart, selectionStart);
      } catch {}
    }
  }
  root.addEventListener('input', (event) => {
    if (event.target.id === 'record-search') {
      filters.q = event.target.value;
      page.page = 1;
      render();
    }
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (
      ![
        'record-month',
        'record-from',
        'record-through',
        'analysis-select-filtered',
        'record-included-only',
      ].includes(target.id) &&
      !target.dataset.selection
    )
      return;
    const map = {
      'record-month': 'month',
      'record-from': 'from',
      'record-through': 'through',
    };
    if (map[target.id]) filters[map[target.id]] = target.value;
    if (target.dataset.selection) ctx.selection.set(target.dataset.selection, target.checked);
    if (target.id === 'analysis-select-filtered')
      ctx.selection.setMany(
        matching().map((e) => e.id),
        target.checked,
      );
    if (target.id === 'record-included-only') ctx.selection.includedOnly = target.checked;
    page.page = 1;
    ctx.render();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.id === 'add-entry') showEntry();
      if (button.id === 'manage-categories') showCategories();
      if (button.id === 'record-category-filter') showCategoryFilter();
      if (button.id === 'record-account-filter') showAccountFilter();
      if (button.dataset.edit) showEntry(button.dataset.edit);
      if (button.dataset.copy) showEntry(button.dataset.copy, { copy: true });
      if (button.dataset.delete)
        confirmAction(
          'Delete entry?',
          'This removes the entry only if all statement and investment links remain valid.',
          () => ctx.command({ type: 'entry.delete', id: button.dataset.delete }),
          'Delete entry',
        );
      if (button.dataset.investment) ctx.showInvestment?.(button.dataset.investment);
      if (button.dataset.statement) ctx.showStatement?.(button.dataset.statement);
      if (button.id === 'record-include-all' || button.id === 'record-exclude-all') {
        ctx.selection.setMany(
          ledger().entries.map((e) => e.id),
          button.id === 'record-include-all',
        );
        ctx.render();
      }
      if (button.id === 'reset-order') ctx.command({ type: 'entries.sort' });
      if (button.id === 'record-reset') {
        Object.assign(filters, defaultFilters());
        page.page = 1;
        render();
      }
      if (button.id === 'assign-filtered') {
        const ids = matching().map((e) => e.id);
        showForm({
          title: 'Assign filtered entries',
          content: `<p class="recording-note">Assign ${ids.length} filtered entries across all pages. All linked operation checks still apply.</p>${selectField('Account', 'accountId', accountOptions(ledger().accounts))}`,
          submitLabel: 'Assign entries',
          onSave: (f, d) => {
            ctx.command({ type: 'entries.assign', ids, accountId: f.elements.accountId.value });
            d.close();
          },
        });
      }
    } catch (error) {
      ctx.notify(error.message, true);
    }
  });
  root.addEventListener('keydown', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip) return;
    const key = { ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' }[event.key];
    if (!key) return;
    event.preventDefault();
    try {
      move(grip.dataset.grip, key);
      root.querySelector(`[data-grip="${CSS.escape(grip.dataset.grip)}"]`)?.focus();
    } catch (error) {
      ctx.notify(error.message, true);
    }
  });
  root.addEventListener('dragstart', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip) return;
    dragged = grip.dataset.grip;
    event.dataTransfer.setData('text/plain', dragged);
    event.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (event) => {
    if (dragged && event.target.closest('[data-entry-row]')) event.preventDefault();
  });
  root.addEventListener('drop', (event) => {
    const row = event.target.closest('[data-entry-row]');
    if (!row || !dragged) return;
    event.preventDefault();
    try {
      reorder(dragged, row.dataset.entryRow);
    } catch (error) {
      ctx.notify(error.message, true);
    }
    dragged = null;
  });
  root.addEventListener('dragend', () => {
    dragged = null;
  });
  return {
    render,
    showEntry,
    showCategories,
    reset: () => {
      const draft = filterDialog;
      filterDialog = null;
      draft?.close();
      Object.assign(filters, defaultFilters());
      page.page = 1;
    },
  };
}
