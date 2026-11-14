import { toCents, today, uid } from '../core/values.mjs';
import { createPresentation } from './formatting.mjs';

const defaultPresentation = createPresentation();

export const $ = (id) => document.getElementById(id);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (cents, presentation = defaultPresentation) => presentation.money(cents);
export const amount = (cents) => {
  let value = BigInt(cents ?? 0);
  const sign = value < 0n ? '-' : '';
  if (value < 0n) value = -value;
  return sign + String(value / 100n) + '.' + String(value % 100n).padStart(2, '0');
};
export const parseMoney = (value) => toCents(String(value).trim());
export const localToday = () => today();
export const newId = (prefix) => `${prefix}-${uid()}`;
export const accountLabel = (
  account,
  { includeType = false, includeAliases = false } = {},
  presentation = defaultPresentation,
) =>
  account
    ? `${account.name}${includeType ? ` · ${kindLabel(account.kind, presentation)}` : ''}${includeAliases && account.aliases?.length ? ` · ${account.aliases.join(' / ')}` : ''}${account.closed ? ` (${presentation.t('ui.closed', 'Closed')})` : ''}`
    : presentation.t('ui.missingAccount', 'Missing account');
export const kindLabel = (kind, presentation = defaultPresentation) =>
  ({
    checking: presentation.t('ui.kind.checking', 'Checking'),
    savings: presentation.t('ui.kind.savings', 'Savings'),
    cd: presentation.t('ui.kind.cd', 'CD'),
    investment: presentation.t('ui.kind.investment', 'Investment'),
    credit_card: presentation.t('ui.kind.creditCard', 'Credit card'),
  })[kind] ?? kind;
export const options = (items, selected = '', placeholder, presentation = defaultPresentation) =>
  `<option value="">${esc(placeholder ?? presentation.t('ui.choose', 'Choose…'))}</option>${items.map((item) => `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.label ?? item.name)}</option>`).join('')}`;
export const accountChoices = (accounts, presentation = defaultPresentation) =>
  accounts
    .slice()
    .sort((a, b) => presentation.compareNames(a.name, b.name) || a.id.localeCompare(b.id, 'en'))
    .map((account) => ({
      id: account.id,
      label: accountLabel(account, { includeType: true, includeAliases: true }, presentation),
    }));
export const accountOptions = (
  accounts,
  selected = '',
  placeholder,
  presentation = defaultPresentation,
) =>
  options(accountChoices(accounts, presentation), selected, placeholder, presentation).replace(
    '<option ',
    '<option data-account-options ',
  );

const accountPickers = new WeakMap();
let activeAccountPicker = null;
export function closeAccountPicker(root = null) {
  if (activeAccountPicker && (!root || root.contains(activeAccountPicker.select)))
    activeAccountPicker.close();
}
export function bindAccountPickers(root, presentation = defaultPresentation) {
  const tr = presentation.t;
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
      tr('ui.pickerAccount', 'Account');
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
export function actionButton(label, attrs = '', icon = '', presentation = defaultPresentation) {
  const lower = label.toLocaleLowerCase('en-US');
  const key =
    icon ||
    (/data-[^=]*(?:edit)/.test(attrs)
      ? 'edit'
      : /data-[^=]*(?:delete|remove)/.test(attrs)
        ? 'delete'
        : /data-[^=]*(?:copy)/.test(attrs)
          ? 'duplicate'
          : /data-[^=]*(?:result-entry)/.test(attrs)
            ? 'link'
            : /data-[^=]*(?:investment)/.test(attrs)
              ? 'activity'
              : /data-[^=]*(?:statement)/.test(attrs)
                ? 'statement'
                : '') ||
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
  const danger = key === 'delete' || /^(delete|remove)/.test(lower) ? ' recording-danger' : '';
  return `<button type="button" class="recording-action${danger}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${actionIcons[key] ?? actionIcons.details}</svg></button>`;
}
export function field(
  label,
  name,
  value = '',
  { type = 'text', required = false, optional = false, hint = '', attrs = '' } = {},
  presentation = defaultPresentation,
) {
  const tr = presentation.t;
  return `<div class="form-field"><label>${esc(label)}${optional ? ` <span>${esc(tr('financial.optional_0c6c41', 'Optional'))}</span>` : ''}<input name="${esc(name)}" type="${type}" value="${esc(value)}"${required ? ' required' : ''} ${attrs}></label>${hint ? `<p class="cash-dialog-help">${esc(hint)}</p>` : ''}</div>`;
}
export function moneyField(
  label,
  name,
  value = '',
  { attrs = '', ...config } = {},
  presentation = defaultPresentation,
) {
  return field(
    label,
    name,
    value,
    {
      ...config,
      attrs: `inputmode="decimal" placeholder="0.00" ${attrs}`,
    },
    presentation,
  );
}
export function selectField(
  label,
  name,
  html,
  required = true,
  presentation = defaultPresentation,
) {
  return `<div class="form-field"><label>${esc(label)}<select name="${esc(name)}"${required ? ' required' : ''}>${html}</select></label></div>`;
}
export function noteField(value = '', name = 'note', label, presentation = defaultPresentation) {
  const tr = presentation.t;
  label ??= tr('ui.note', 'Note');
  return `<div class="form-field"><label>${esc(label)} <span>${esc(tr('financial.optional_0c6c41', 'Optional'))}</span><textarea name="${esc(name)}" rows="3" maxlength="2000">${esc(value)}</textarea></label></div>`;
}
export function datesHTML(value = {}, prefix = '', presentation = defaultPresentation) {
  const tr = presentation.t;
  const activity = value.activityDate ?? localToday(),
    posted = value.postedDate ?? activity;
  return `<div class="form-grid date-pair"><div class="form-field"><div class="date-label-row"><label for="${prefix}activityDate">${esc(tr('financial.activity_date_14bd67', 'Activity date'))}</label><button type="button" class="date-copy" data-copy-date="${prefix}postedDate" data-date-target="${prefix}activityDate">${esc(tr('financial.use_posting_date_919d58', 'Use posting date'))}</button></div><input id="${prefix}activityDate" name="${prefix}activityDate" type="date" value="${esc(activity)}" required min="0001-01-01" max="9999-12-31"><label class="date-unconfirmed"><input type="checkbox" name="${prefix}activityDateUnconfirmed"${value.activityDateUnconfirmed ? ' checked' : ''}>${esc(tr('financial.activity_date_unconfirmed_c87845', 'Activity date unconfirmed'))}</label></div><div class="form-field"><div class="date-label-row"><label for="${prefix}postedDate">${esc(tr('financial.posting_date_342b55', 'Posting date'))}</label><button type="button" class="date-copy" data-copy-date="${prefix}activityDate" data-date-target="${prefix}postedDate">${esc(tr('financial.use_activity_date_3854c5', 'Use activity date'))}</button></div><input id="${prefix}postedDate" name="${prefix}postedDate" type="date" value="${esc(posted)}" required min="0001-01-01" max="9999-12-31"><label class="date-unconfirmed"><input type="checkbox" name="${prefix}postedDateUnconfirmed"${value.postedDateUnconfirmed ? ' checked' : ''}>${esc(tr('financial.posting_date_unconfirmed_4ab5a7', 'Posting date unconfirmed'))}</label></div></div>`;
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
export const dateCell = (entry, presentation = defaultPresentation) => {
  const tr = presentation.t;
  return `<span>${esc(entry.activityDate)}${entry.activityDateUnconfirmed ? `<span class="uncertain" title="${esc(tr('financial.activity_date_unconfirmed_c87845', 'Activity date unconfirmed'))}">?</span>` : ''}</span><small class="posted-date">${esc(tr('financial.posted_301777', 'Posted'))} ${esc(entry.postedDate)}${entry.postedDateUnconfirmed ? `<span class="uncertain" title="${esc(tr('financial.posting_date_unconfirmed_4ab5a7', 'Posting date unconfirmed'))}">?</span>` : ''}</small>`;
};
export function showForm({
  title,
  content,
  submitLabel,
  onSave,
  onClose,
  wide = false,
  presentation = defaultPresentation,
}) {
  const tr = presentation.t;
  submitLabel ??= tr('ui.save', 'Save');
  const dialog = document.createElement('dialog');
  dialog.className = `entry-dialog recording-dialog${wide ? ' recording-dialog-wide' : ''}`;
  const titleId = `dialog-${newId('title')}`;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="${titleId}">${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="${esc(tr('financial.close_form_56adc8', 'Close form'))}">×</button></div>${content}<p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button button-outline" data-close>${esc(tr('financial.cancel_77dfd2', 'Cancel'))}</button><button type="submit" class="button button-primary">${esc(submitLabel)}</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'),
    error = form.querySelector('.form-error');
  dialog
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()));
  const showError = (value) => {
    error.textContent = presentation.error(value);
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
  bindAccountPickers(form, presentation);
  dialog.showModal();
  return { dialog, form, showError };
}
export function showSelectionFilter({
  title,
  description,
  groups,
  onApply,
  onClose,
  presentation = defaultPresentation,
}) {
  const tr = presentation.t;
  const draft = new Map(
    groups.map((group) => [group.id, group.selection === null ? null : new Set(group.selection)]),
  );
  const selected = (groupId, id) => draft.get(groupId) === null || draft.get(groupId).has(id);
  const { form, dialog } = showForm({
    title,
    presentation,
    wide: groups.length > 1,
    content: `<p class="cash-dialog-help">${esc(description)}</p><div class="recording-filter-groups${groups.length === 1 ? ' recording-filter-groups-single' : ''}">${groups.map((group) => `<fieldset class="recording-filter-group" data-selection-group="${esc(group.id)}"><legend>${esc(group.label)}</legend><div class="recording-filter-group-actions"><button type="button" class="button button-outline button-compact" data-filter-group="${esc(group.id)}" data-filter-select="all" aria-label="${esc(tr('financial.select_all_913aff', 'Select all'))} ${esc(group.label.toLowerCase())}">${esc(tr('financial.select_all_913aff', 'Select all'))}</button><button type="button" class="button button-outline button-compact" data-filter-group="${esc(group.id)}" data-filter-select="none" aria-label="${esc(tr('financial.deselect_all_85cce1', 'Deselect all'))} ${esc(group.label.toLowerCase())}">${esc(tr('financial.deselect_all_85cce1', 'Deselect all'))}</button></div><div class="recording-check-list">${group.items.length ? group.items.map((item) => `<label><input type="checkbox" data-filter-choice="${esc(item.id)}" data-choice-group="${esc(group.id)}"${selected(group.id, item.id) ? ' checked' : ''}><span>${esc(item.label)}</span></label>`).join('') : `<p class="recording-note">${esc(tr('financial.no_choices_yet_5cb3a9', 'No choices yet.'))}</p>`}</div><p class="recording-note" data-selection-status="${esc(group.id)}" role="status"></p></fieldset>`).join('')}</div>`,
    submitLabel: tr('financial.apply_filters_926161', 'Apply filters'),
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
      form.querySelector(`[data-selection-status="${group.id}"]`).textContent = tr(
        'ui.selectedCount',
        '{count} of {total} selected',
        { count, total: group.items.length },
      );
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

export function confirmAction(
  title,
  description,
  action,
  label,
  presentation = defaultPresentation,
) {
  const tr = presentation.t;
  return showForm({
    title,
    content: `<p class="cash-dialog-copy">${esc(description)}</p>`,
    submitLabel: label ?? tr('ui.delete', 'Delete'),
    presentation,
    onSave: async (_form, dialog) => {
      await action();
      dialog.close();
    },
  });
}
export function tableLabel(key, presentation = defaultPresentation) {
  return presentation.language === 'en'
    ? key
    : presentation.t(`tables.${key}`, presentation.t('ui.dataTable', 'Data table'));
}
export function tableHTML(
  key,
  headings,
  items,
  renderRow,
  state,
  size = 20,
  empty,
  presentation = defaultPresentation,
) {
  const tr = presentation.t;
  empty ??= tr('ui.noRecords', 'No records to display.');
  const pages = Math.max(1, Math.ceil(items.length / size));
  state.page = Math.min(Math.max(1, state.page || 1), pages);
  const start = (state.page - 1) * size;
  return `<div class="records-surface"><div class="table-scroll" role="region" aria-label="${esc(tableLabel(key, presentation))}" data-table-key="${esc(key)}" tabindex="0"><table><thead><tr>${headings
    .map((heading) => {
      const label =
        typeof heading === 'string'
          ? heading
          : heading.monetary
            ? esc(presentation.currencyLabel(heading.label))
            : heading.label;
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
  }</tbody></table></div><div class="table-footer"><span>${items.length ? tr('ui.recordRange', '{start}–{end} of {total}', { start: start + 1, end: Math.min(start + size, items.length), total: items.length }) : tr('ui.zeroRecords', '0 records')}</span><div class="pagination" data-pager="${esc(key)}"><button class="button button-outline button-compact" type="button" data-page="first"${state.page === 1 ? ' disabled' : ''}>${esc(tr('financial.first_page_49d74b', 'First page'))}</button><button class="icon-button" type="button" data-page="previous" aria-label="${esc(tr('financial.previous_page_81f547', 'Previous page'))}"${state.page === 1 ? ' disabled' : ''}>‹</button><form class="page-jump"><label>${esc(tr('financial.page_fb0627', 'Page'))} <input type="number" name="page" value="${state.page}" min="1" max="${pages}" step="1" inputmode="numeric" aria-label="${esc(tr('financial.go_to_page_15e973', 'Go to page'))}"></label><span>${esc(tr('financial.of_de04fa', 'of'))} ${pages}</span><button class="button button-outline button-compact" type="submit"${items.length ? '' : ' disabled'}>${esc(tr('financial.go_2e0b45', 'Go'))}</button></form><button class="icon-button" type="button" data-page="next" aria-label="${esc(tr('financial.next_page_4bfc19', 'Next page'))}"${state.page === pages ? ' disabled' : ''}>›</button><button class="button button-outline button-compact" type="button" data-page="last"${state.page === pages ? ' disabled' : ''}>${esc(tr('financial.last_page_b01f16', 'Last page'))}</button><p class="pagination-error" role="alert" hidden></p></div></div></div>`;
}
export function bindPager(
  root,
  key,
  count,
  state,
  size,
  onChange,
  presentation = defaultPresentation,
) {
  const tr = presentation.t;
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
      error.textContent = tr(
        'ui.pageNumberRange',
        'Choose a whole page number from 1 to {pages}.',
        { pages },
      );
      error.hidden = false;
      return;
    }
    state.page = value;
    onChange();
  });
}
export function totalsHTML(items, { available = true } = {}, presentation = defaultPresentation) {
  const tr = presentation.t;
  const money = presentation.money;
  if (!available)
    return `<div class="summary-grid">${[tr('financial.total_gains_acf4f9', 'Total gains'), tr('financial.total_expenses_67fe37', 'Total expenses'), tr('financial.net_recorded_bb7e3c', 'Net recorded')].map((label) => `<div class="summary-stat"><span class="stat-label">${esc(presentation.currencyLabel(label))}</span><strong class="stat-value">—</strong><span class="stat-caption">${esc(tr('financial.correct_the_date_range_to_show_totals_e0ab9c', 'Correct the date range to show totals'))}</span></div>`).join('')}</div>`;
  const gains = items
      .filter((e) => e.kind === 'gain')
      .reduce((sum, e) => sum + BigInt(e.amountCents), 0n),
    expenses = items
      .filter((e) => e.kind === 'expense')
      .reduce((sum, e) => sum + BigInt(e.amountCents), 0n);
  return `<div class="summary-grid"><div class="summary-stat"><span class="stat-label">${esc(presentation.currencyLabel(tr('financial.total_gains_acf4f9', 'Total gains')))}</span><strong class="stat-value gains-value">${money(gains)}</strong><span class="stat-caption">${esc(tr('financial.recorded_gains_in_this_view_960995', 'Recorded gains in this view'))}</span></div><div class="summary-stat"><span class="stat-label">${esc(presentation.currencyLabel(tr('financial.total_expenses_67fe37', 'Total expenses')))}</span><strong class="stat-value">${money(expenses)}</strong><span class="stat-caption">${esc(tr('financial.recorded_expenses_in_this_view_9c1195', 'Recorded expenses in this view'))}</span></div><div class="summary-stat"><span class="stat-label">${esc(presentation.currencyLabel(tr('financial.net_recorded_bb7e3c', 'Net recorded')))}</span><strong class="stat-value">${money(gains - expenses)}</strong><span class="stat-caption">${esc(tr('financial.gains_minus_expenses_7b876e', 'Gains minus expenses'))}</span></div></div>`;
}

/** Bind presentation to a screen without sharing mutable language or currency state. */
export function createUIHelpers(context = {}) {
  const get =
    typeof context === 'function'
      ? context
      : () =>
          context.getPresentation?.() ??
          createPresentation({ currency: context.getDocument?.().ledger.currency ?? 'USD' });
  return {
    t: (...args) => get().t(...args),
    error: (value) => get().error(value),
    money: (value) => money(value, get()),
    kindLabel: (kind) => kindLabel(kind, get()),
    accountLabel: (account, config) => accountLabel(account, config, get()),
    accountChoices: (accounts) => accountChoices(accounts, get()),
    accountOptions: (accounts, selected, placeholder) =>
      accountOptions(accounts, selected, placeholder, get()),
    options: (items, selected, placeholder) => options(items, selected, placeholder, get()),
    bindAccountPickers: (root) => bindAccountPickers(root, get()),
    field: (label, name, value, config) => field(label, name, value, config, get()),
    moneyField: (label, name, value, config) => moneyField(label, name, value, config, get()),
    selectField: (label, name, html, required) => selectField(label, name, html, required, get()),
    noteField: (value, name, label) => noteField(value, name, label, get()),
    datesHTML: (value, prefix) => datesHTML(value, prefix, get()),
    dateCell: (entry) => dateCell(entry, get()),
    actionButton: (label, attrs, icon) => actionButton(label, attrs, icon, get()),
    showForm: (config) => showForm({ ...config, presentation: get() }),
    showSelectionFilter: (config) => showSelectionFilter({ ...config, presentation: get() }),
    confirmAction: (title, description, action, label) =>
      confirmAction(title, description, action, label, get()),
    tableLabel: (key) => tableLabel(key, get()),
    tableHTML: (key, headings, items, row, state, size, empty) =>
      tableHTML(key, headings, items, row, state, size, empty, get()),
    bindPager: (root, key, count, state, size, change) =>
      bindPager(root, key, count, state, size, change, get()),
    totalsHTML: (items, config) => totalsHTML(items, config, get()),
    compareNames: (a, b) => get().compareNames(a, b),
    unit: () => get().currency,
    currencyLabel: (label) => get().currencyLabel(label),
  };
}
