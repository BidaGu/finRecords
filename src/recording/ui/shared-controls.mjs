import { toCents, today, uid } from '../core/values.mjs';

export const $ = (id) => document.getElementById(id);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (cents) => {
  let value = BigInt(cents ?? 0);
  const sign = value < 0n ? '-' : '';
  if (value < 0n) value = -value;
  return (
    sign +
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value / 100n) +
    '.' +
    String(value % 100n).padStart(2, '0')
  );
};
export const amount = (cents) => {
  let value = BigInt(cents ?? 0);
  const sign = value < 0n ? '-' : '';
  if (value < 0n) value = -value;
  return sign + String(value / 100n) + '.' + String(value % 100n).padStart(2, '0');
};
export const parseMoney = (value) => toCents(String(value).trim());
export const localToday = () => today();
export const newId = (prefix) => `${prefix}-${uid()}`;
export const accountLabel = (account, { includeType = false, includeAliases = false } = {}) =>
  account
    ? `${account.name}${includeType ? ` · ${kindLabel(account.kind)}` : ''}${includeAliases && account.aliases?.length ? ` · ${account.aliases.join(' / ')}` : ''}${account.closed ? ' (Closed)' : ''}`
    : 'Missing account';
export const kindLabel = (kind) =>
  ({
    checking: 'Checking',
    savings: 'Savings',
    cd: 'CD',
    investment: 'Investment',
    credit_card: 'Credit card',
  })[kind] ?? kind;
export const options = (items, selected = '', placeholder = 'Choose…') =>
  `<option value="">${esc(placeholder)}</option>${items.map((item) => `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.label ?? item.name)}</option>`).join('')}`;
export const accountChoices = (accounts) =>
  accounts
    .slice()
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id, 'en'),
    )
    .map((account) => ({
      id: account.id,
      label: accountLabel(account, { includeType: true, includeAliases: true }),
    }));
export const accountOptions = (accounts, selected = '', placeholder = 'Choose…') =>
  options(accountChoices(accounts), selected, placeholder).replace(
    '<option ',
    '<option data-account-options ',
  );

const accountPickers = new WeakMap();
let activeAccountPicker = null;
export function closeAccountPicker(root = null) {
  if (activeAccountPicker && (!root || root.contains(activeAccountPicker.select)))
    activeAccountPicker.close();
}
export function bindAccountPickers(root) {
  if (activeAccountPicker && !activeAccountPicker.select.isConnected) closeAccountPicker();
  for (const select of root.querySelectorAll('select')) {
    if (!select.querySelector('[data-account-options]') || accountPickers.has(select)) continue;
    const id = select.id ? `${select.id}-picker` : newId('account-picker');
    const label = select.closest('label') ?? select.labels?.[0];
    const name =
      select.getAttribute('aria-label') ||
      [...(label?.childNodes ?? [])]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join(' ')
        .trim() ||
      'Account';
    const control = document.createElement('span');
    control.className = 'recording-account-control';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${id}-trigger`;
    trigger.className = 'recording-account-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-list`);
    if (select.required) trigger.setAttribute('aria-required', 'true');
    const feedback = document.createElement('span');
    feedback.id = `${id}-error`;
    feedback.className = 'form-error recording-account-error';
    feedback.setAttribute('role', 'alert');
    feedback.hidden = true;
    control.append(trigger, feedback);
    select.insertAdjacentElement('afterend', control);
    select.classList.add('recording-account-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    let menu = null,
      scrollList = null,
      choices = [],
      nodes = [],
      active = 0,
      search = '',
      searchedAt = 0;
    const sync = () => {
      const option = [...select.querySelectorAll('option')].find(
        (item) => item.value === select.value,
      );
      const text = option?.textContent ?? '';
      trigger.textContent = text;
      trigger.title = text;
      trigger.disabled = select.disabled;
      trigger.setAttribute('aria-label', `${name}: ${text}`);
      if (select.validity?.valid !== false) {
        feedback.hidden = true;
        trigger.removeAttribute('aria-invalid');
        trigger.removeAttribute('aria-describedby');
      }
    };
    const close = () => {
      menu?.remove();
      menu = null;
      scrollList = null;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', close);
      if (activeAccountPicker?.select === select) activeAccountPicker = null;
      search = '';
    };
    const outside = (event) => {
      if (!control.contains(event.target) && !menu?.contains(event.target)) close();
    };
    const scrolled = (event) => {
      if (!menu?.contains(event.target)) close();
    };
    const highlight = (index) => {
      active = Math.max(0, Math.min(index, choices.length - 1));
      nodes.forEach((node, i) => {
        node.classList.toggle('is-active', i === active);
        node.setAttribute('aria-selected', String(i === active));
      });
      trigger.setAttribute('aria-activedescendant', nodes[active].id);
      if (nodes[active].parentElement === scrollList) {
        const top = nodes[active].offsetTop - scrollList.offsetTop;
        if (top < scrollList.scrollTop) scrollList.scrollTop = top;
        else if (top + nodes[active].offsetHeight > scrollList.scrollTop + scrollList.clientHeight)
          scrollList.scrollTop = top + nodes[active].offsetHeight - scrollList.clientHeight;
      }
    };
    const commit = () => {
      const value = choices[active]?.value;
      if (value === undefined || choices[active].disabled) return;
      close();
      const changed = select.value !== value;
      select.value = value;
      sync();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
      const current = select.isConnected ? select : select.id ? $(select.id) : null;
      accountPickers.get(current)?.trigger.focus();
    };
    const open = () => {
      if (menu || select.disabled) return;
      closeAccountPicker();
      choices = [...select.querySelectorAll('option')];
      if (!choices.length) return;
      menu = document.createElement('div');
      menu.id = `${id}-list`;
      menu.className = 'recording-account-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', name);
      const list = document.createElement('div');
      list.className = 'recording-account-options';
      scrollList = list;
      nodes = choices.map((option, index) => {
        const node = document.createElement('div');
        node.id = `${id}-option-${index}`;
        node.className = 'recording-account-option';
        node.setAttribute('role', 'option');
        node.dataset.value = option.value;
        node.dataset.index = String(index);
        node.textContent = option.textContent;
        node.title = option.textContent;
        if (option.disabled) node.setAttribute('aria-disabled', 'true');
        node.addEventListener('pointerdown', (event) => event.preventDefault());
        node.addEventListener('pointermove', () => highlight(index));
        node.addEventListener('click', () => {
          highlight(index);
          commit();
        });
        if (option.value === '') {
          node.classList.add('recording-account-prompt');
          menu.append(node);
        } else list.append(node);
        return node;
      });
      menu.append(list);
      (select.closest('dialog') ?? document.body).append(menu);
      const rect = trigger.getBoundingClientRect();
      const margin = 8,
        row = 32,
        promptHeight = choices.some((option) => option.value === '') ? row : 0,
        rows = Math.max(
          1,
          Math.min(15, Math.floor((window.innerHeight - margin * 2 - promptHeight - 2) / row)),
        ),
        count = choices.filter((option) => option.value !== '').length,
        height = Math.min(rows, count) * row + promptHeight + 2,
        width = Math.min(Math.max(rect.width, 280), window.innerWidth - margin * 2);
      list.style.maxHeight = `${rows * row}px`;
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width))}px`;
      menu.style.top = `${Math.max(margin, Math.min(rect.bottom + 4, window.innerHeight - margin - height))}px`;
      activeAccountPicker = { select, close };
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('scroll', scrolled, true);
      window.addEventListener('resize', close);
      highlight(
        Math.max(
          0,
          choices.findIndex((option) => option.value === select.value),
        ),
      );
    };
    trigger.addEventListener('click', () => (menu ? close() : open()));
    trigger.addEventListener('keydown', (event) => {
      const wasOpen = Boolean(menu);
      if (event.key === 'Escape' && wasOpen) {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        if (menu) commit();
        return;
      }
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        menu ? commit() : open();
        return;
      }
      const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15 }[event.key];
      if (move || ['Home', 'End'].includes(event.key)) {
        event.preventDefault();
        open();
        highlight(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? choices.length - 1
              : active + (wasOpen ? move : 0),
        );
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        open();
        const now = Date.now(),
          letter = event.key.toLocaleLowerCase();
        search = now - searchedAt > 700 ? letter : search + letter;
        searchedAt = now;
        const repeated = [...search].every((item) => item === letter);
        const prefix = repeated ? letter : search;
        const start = repeated ? active + 1 : 0;
        for (let step = 0; step < choices.length; step++) {
          const index = (start + step) % choices.length;
          if (
            !choices[index].disabled &&
            choices[index].textContent.toLocaleLowerCase().startsWith(prefix)
          ) {
            highlight(index);
            break;
          }
        }
      }
    });
    trigger.addEventListener('blur', (event) => {
      if (
        event.relatedTarget &&
        !control.contains(event.relatedTarget) &&
        !menu?.contains(event.relatedTarget)
      )
        close();
    });
    select.addEventListener('change', sync);
    select.addEventListener('click', (event) => event.preventDefault());
    select.addEventListener('focus', () => {
      trigger.focus();
      open();
    });
    select.addEventListener('invalid', (event) => {
      event.preventDefault();
      feedback.textContent = select.validationMessage;
      feedback.hidden = false;
      trigger.setAttribute('aria-invalid', 'true');
      trigger.setAttribute('aria-describedby', feedback.id);
      trigger.focus();
      open();
    });
    accountPickers.set(select, { trigger });
    sync();
  }
}
const actionIcons = {
  edit: '<path d="m16 3 5 5M4 20l4.5-1 12-12a1.8 1.8 0 0 0-5-5l-12 12L3 21Z"/>',
  duplicate:
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/>',
  delete: '<path d="M3 6h18M9 6V4h6v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  details:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6"/>',
  activity: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  statement: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h4"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1) scale(.92)"/>',
  sell: '<path d="M7 17 17 7M7 7h10v10M4 13v7h7"/>',
  redeem: '<path d="M4 7h11a5 5 0 0 1 0 10h-3M4 7l4-4M4 7l4 4M7 17h.01M4 17h.01"/>',
};
export function actionButton(label, attrs = '', icon = '') {
  const lower = label.toLocaleLowerCase('en-US');
  const key =
    icon ||
    (lower.startsWith('edit')
      ? 'edit'
      : lower.startsWith('duplicate')
        ? 'duplicate'
        : /^(delete|remove)/.test(lower)
          ? 'delete'
          : lower.includes('statement')
            ? 'statement'
            : lower.includes('gain/expense')
              ? 'link'
              : lower.includes('activity')
                ? 'activity'
                : lower.startsWith('sell')
                  ? 'sell'
                  : lower.startsWith('redeem')
                    ? 'redeem'
                    : 'details');
  const danger = /^(delete|remove)/.test(lower) ? ' recording-danger' : '';
  return `<button type="button" class="recording-action${danger}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${actionIcons[key] ?? actionIcons.details}</svg></button>`;
}
export function field(
  label,
  name,
  value = '',
  { type = 'text', required = false, optional = false, hint = '', attrs = '' } = {},
) {
  return `<div class="form-field"><label>${esc(label)}${optional ? ' <span>Optional</span>' : ''}<input name="${esc(name)}" type="${type}" value="${esc(value)}"${required ? ' required' : ''} ${attrs}></label>${hint ? `<p class="cash-dialog-help">${esc(hint)}</p>` : ''}</div>`;
}
export function moneyField(label, name, value = '', { attrs = '', ...config } = {}) {
  return field(label, name, value, {
    ...config,
    attrs: `inputmode="decimal" placeholder="0.00" ${attrs}`,
  });
}
export function selectField(label, name, html, required = true) {
  return `<div class="form-field"><label>${esc(label)}<select name="${esc(name)}"${required ? ' required' : ''}>${html}</select></label></div>`;
}
export function noteField(value = '', name = 'note', label = 'Note') {
  return `<div class="form-field"><label>${esc(label)} <span>Optional</span><textarea name="${esc(name)}" rows="3" maxlength="2000">${esc(value)}</textarea></label></div>`;
}
export function datesHTML(value = {}, prefix = '') {
  const activity = value.activityDate ?? localToday(),
    posted = value.postedDate ?? activity;
  return `<div class="form-grid date-pair"><div class="form-field"><div class="date-label-row"><label for="${prefix}activityDate">Activity date</label><button type="button" class="date-copy" data-copy-date="${prefix}postedDate" data-date-target="${prefix}activityDate">Use posting date</button></div><input id="${prefix}activityDate" name="${prefix}activityDate" type="date" value="${esc(activity)}" required min="0001-01-01" max="9999-12-31"><label class="date-unconfirmed"><input type="checkbox" name="${prefix}activityDateUnconfirmed"${value.activityDateUnconfirmed ? ' checked' : ''}>Activity date unconfirmed</label></div><div class="form-field"><div class="date-label-row"><label for="${prefix}postedDate">Posting date</label><button type="button" class="date-copy" data-copy-date="${prefix}activityDate" data-date-target="${prefix}postedDate">Use activity date</button></div><input id="${prefix}postedDate" name="${prefix}postedDate" type="date" value="${esc(posted)}" required min="0001-01-01" max="9999-12-31"><label class="date-unconfirmed"><input type="checkbox" name="${prefix}postedDateUnconfirmed"${value.postedDateUnconfirmed ? ' checked' : ''}>Posting date unconfirmed</label></div></div>`;
}
export function readDates(form, prefix = '') {
  return {
    activityDate: form.elements[`${prefix}activityDate`].value,
    postedDate: form.elements[`${prefix}postedDate`].value,
    activityDateUnconfirmed: form.elements[`${prefix}activityDateUnconfirmed`].checked,
    postedDateUnconfirmed: form.elements[`${prefix}postedDateUnconfirmed`].checked,
  };
}
export function bindDateCopies(form) {
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy-date]');
    if (!button) return;
    const source = form.elements[button.dataset.copyDate],
      target = form.elements[button.dataset.dateTarget];
    if (source?.value && target) {
      target.value = source.value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
export const dateCell = (entry) =>
  `<span>${esc(entry.activityDate)}${entry.activityDateUnconfirmed ? '<span class="uncertain" title="Activity date unconfirmed">?</span>' : ''}</span><small class="posted-date">Posted ${esc(entry.postedDate)}${entry.postedDateUnconfirmed ? '<span class="uncertain" title="Posting date unconfirmed">?</span>' : ''}</small>`;
export function showForm({ title, content, submitLabel = 'Save', onSave, onClose, wide = false }) {
  const dialog = document.createElement('dialog');
  dialog.className = `entry-dialog recording-dialog${wide ? ' recording-dialog-wide' : ''}`;
  const titleId = `dialog-${newId('title')}`;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="${titleId}">${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Close form">×</button></div>${content}<p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button button-outline" data-close>Cancel</button><button type="submit" class="button button-primary">${esc(submitLabel)}</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'),
    error = form.querySelector('.form-error');
  dialog
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()));
  const showError = (value) => {
    error.textContent = value?.message ?? String(value);
    error.hidden = false;
    error.scrollIntoView({ block: 'nearest' });
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await onSave(form, dialog);
    } catch (failure) {
      showError(failure);
    } finally {
      submit.disabled = false;
    }
  });
  dialog.addEventListener(
    'close',
    () => {
      closeAccountPicker(dialog);
      onClose?.();
      dialog.remove();
    },
    { once: true },
  );
  bindDateCopies(form);
  bindAccountPickers(form);
  dialog.showModal();
  return { dialog, form, showError };
}
export function showSelectionFilter({ title, description, groups, onApply, onClose }) {
  const draft = new Map(
    groups.map((group) => [group.id, group.selection === null ? null : new Set(group.selection)]),
  );
  const selected = (groupId, id) => draft.get(groupId) === null || draft.get(groupId).has(id);
  const { form, dialog } = showForm({
    title,
    wide: groups.length > 1,
    content: `<p class="cash-dialog-help">${esc(description)}</p><div class="recording-filter-groups${groups.length === 1 ? ' recording-filter-groups-single' : ''}">${groups.map((group) => `<fieldset class="recording-filter-group" data-selection-group="${esc(group.id)}"><legend>${esc(group.label)}</legend><div class="recording-filter-group-actions"><button type="button" class="button button-outline button-compact" data-filter-group="${esc(group.id)}" data-filter-select="all" aria-label="Select all ${esc(group.label.toLowerCase())}">Select all</button><button type="button" class="button button-outline button-compact" data-filter-group="${esc(group.id)}" data-filter-select="none" aria-label="Deselect all ${esc(group.label.toLowerCase())}">Deselect all</button></div><div class="recording-check-list">${group.items.length ? group.items.map((item) => `<label><input type="checkbox" data-filter-choice="${esc(item.id)}" data-choice-group="${esc(group.id)}"${selected(group.id, item.id) ? ' checked' : ''}><span>${esc(item.label)}</span></label>`).join('') : '<p class="recording-note">No choices yet.</p>'}</div><p class="recording-note" data-selection-status="${esc(group.id)}" role="status"></p></fieldset>`).join('')}</div>`,
    submitLabel: 'Apply filters',
    onSave: (_form, view) => {
      onApply(
        new Map([...draft].map(([id, choice]) => [id, choice === null ? null : new Set(choice)])),
      );
      view.close();
    },
    onClose,
  });
  dialog.classList.add('recording-filter-dialog');
  function updateCounts() {
    for (const group of groups) {
      const count = group.items.filter((item) => selected(group.id, item.id)).length;
      form.querySelector(`[data-selection-status="${group.id}"]`).textContent =
        `${count} of ${group.items.length} selected`;
    }
  }
  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!input.dataset.filterChoice) return;
    const group = groups.find((item) => item.id === input.dataset.choiceGroup);
    if (!group) return;
    if (draft.get(group.id) === null)
      draft.set(group.id, new Set(group.items.map((item) => item.id)));
    input.checked
      ? draft.get(group.id).add(input.dataset.filterChoice)
      : draft.get(group.id).delete(input.dataset.filterChoice);
    updateCounts();
  });
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-select]');
    if (!button) return;
    const groupId = button.dataset.filterGroup;
    draft.set(groupId, button.dataset.filterSelect === 'all' ? null : new Set());
    for (const input of form.querySelectorAll('[data-filter-choice]'))
      if (input.dataset.choiceGroup === groupId)
        input.checked = selected(groupId, input.dataset.filterChoice);
    updateCounts();
  });
  updateCounts();
  return { form, dialog };
}

export function confirmAction(title, description, action, label = 'Delete') {
  return showForm({
    title,
    content: `<p class="cash-dialog-copy">${esc(description)}</p>`,
    submitLabel: label,
    onSave: async (_form, dialog) => {
      await action();
      dialog.close();
    },
  });
}
export function tableHTML(
  key,
  headings,
  items,
  renderRow,
  state,
  size = 20,
  empty = 'No records to display.',
) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  state.page = Math.min(Math.max(1, state.page || 1), pages);
  const start = (state.page - 1) * size;
  return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${esc(key)}" tabindex="0"><table><thead><tr>${headings
    .map((heading) => {
      const label = typeof heading === 'string' ? heading : heading.label;
      const align = typeof heading === 'string' ? 'start' : heading.align;
      const alignment = ['start', 'center', 'end'].includes(align) ? align : 'start';
      return `<th scope="col" class="table-align-${alignment}">${label}</th>`;
    })
    .join('')}</tr></thead><tbody>${
    items
      .slice(start, start + size)
      .map(renderRow)
      .join('') ||
    `<tr><td colspan="${headings.length}" class="table-empty">${esc(empty)}</td></tr>`
  }</tbody></table></div><div class="table-footer"><span>${items.length ? `${start + 1}–${Math.min(start + size, items.length)} of ${items.length}` : '0 records'}</span><div class="pagination" data-pager="${esc(key)}"><button class="button button-outline button-compact" type="button" data-page="first"${state.page === 1 ? ' disabled' : ''}>First page</button><button class="icon-button" type="button" data-page="previous" aria-label="Previous page"${state.page === 1 ? ' disabled' : ''}>‹</button><form class="page-jump"><label>Page <input type="number" name="page" value="${state.page}" min="1" max="${pages}" step="1" inputmode="numeric" aria-label="Go to page"></label><span>of ${pages}</span><button class="button button-outline button-compact" type="submit"${items.length ? '' : ' disabled'}>Go</button></form><button class="icon-button" type="button" data-page="next" aria-label="Next page"${state.page === pages ? ' disabled' : ''}>›</button><button class="button button-outline button-compact" type="button" data-page="last"${state.page === pages ? ' disabled' : ''}>Last page</button><p class="pagination-error" role="alert" hidden></p></div></div></div>`;
}
export function bindPager(root, key, count, state, size, onChange) {
  const pager = [...root.querySelectorAll('[data-pager]')].find((el) => el.dataset.pager === key);
  if (!pager) return;
  const pages = Math.max(1, Math.ceil(count / size));
  pager.addEventListener('click', (event) => {
    const action = event.target.closest('[data-page]')?.dataset.page;
    if (!action) return;
    state.page = { first: 1, previous: state.page - 1, next: state.page + 1, last: pages }[action];
    onChange();
  });
  pager.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get('page'));
    const error = pager.querySelector('.pagination-error');
    if (!Number.isInteger(value) || value < 1 || value > pages) {
      error.textContent = `Choose a whole page number from 1 to ${pages}.`;
      error.hidden = false;
      return;
    }
    state.page = value;
    onChange();
  });
}
export function totalsHTML(items, { available = true } = {}) {
  if (!available)
    return `<div class="summary-grid">${['Total gains', 'Total expenses', 'Net recorded'].map((label) => `<div class="summary-stat"><span class="stat-label">${label}</span><strong class="stat-value">—</strong><span class="stat-caption">Correct the date range to show totals</span></div>`).join('')}</div>`;
  const gains = items
      .filter((e) => e.kind === 'gain')
      .reduce((sum, e) => sum + BigInt(e.amountCents), 0n),
    expenses = items
      .filter((e) => e.kind === 'expense')
      .reduce((sum, e) => sum + BigInt(e.amountCents), 0n);
  return `<div class="summary-grid"><div class="summary-stat"><span class="stat-label">Total gains</span><strong class="stat-value gains-value">${money(gains)}</strong><span class="stat-caption">Recorded gains in this view</span></div><div class="summary-stat"><span class="stat-label">Total expenses</span><strong class="stat-value">${money(expenses)}</strong><span class="stat-caption">Recorded expenses in this view</span></div><div class="summary-stat"><span class="stat-label">Net recorded</span><strong class="stat-value">${money(gains - expenses)}</strong><span class="stat-caption">Gains minus expenses</span></div></div>`;
}
