import { createPresentation } from '../formatting.mjs';

export const optionsHTML = (choices, value) =>
  choices
    .map(
      ([id, label]) => `<option value="${id}"${id === value ? ' selected' : ''}>${label}</option>`,
    )
    .join('');

export function formatDecimal(value, currency = false, presentation = createPresentation()) {
  return presentation.decimal(value, currency);
}

export function createRootQuery(root) {
  if (!root?.querySelector) throw new TypeError('A calculator root element is required.');
  return (id) => root.querySelector(`#${id}`);
}

export function createDraftState(defaults) {
  let needsReset = true;
  const state = {
    draft: defaults(),
    result: null,
    error: '',
    stale: false,
    reset() {
      state.draft = defaults();
      state.result = null;
      state.error = '';
      state.stale = false;
      needsReset = true;
    },
    capture(next) {
      if (JSON.stringify(next) === JSON.stringify(state.draft)) return false;
      state.draft = next;
      state.stale = state.stale || state.result !== null;
      state.result = null;
      state.error = '';
      return true;
    },
    beginRender(captureDraft) {
      if (!needsReset) captureDraft();
      needsReset = false;
    },
  };
  return state;
}

export function scopedPresentation(getPresentation, currency = 'USD') {
  return getPresentation?.(currency) ?? createPresentation({ currency });
}
export function calculatorError(code, message, params = {}) {
  const shown = message.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) =>
    String(params[key] ?? `{${key}}`),
  );
  return Object.assign(new Error(shown), { code, params });
}
export function presetCurrency(raw) {
  if (Object.hasOwn(raw, 'currency') && !['USD', 'CNY'].includes(raw.currency))
    throw calculatorError('calc.preset.currency', 'Preset currency must be USD or CNY.');
  return Object.hasOwn(raw, 'currency') ? { currency: raw.currency } : {};
}
export function currencyField(p, id) {
  return `<label class="compound-tool-schedule-control calculator-currency">${p.t('calc.currency', 'Currency')}<select id="${id}" name="currency" aria-describedby="${id}-help"><option value="USD"${p.currency === 'USD' ? ' selected' : ''}>${p.t('calc.currency.usd', 'USD · US dollar')}</option><option value="CNY"${p.currency === 'CNY' ? ' selected' : ''}>${p.t('calc.currency.cny', 'CNY · RMB')}</option></select></label><p id="${id}-help" class="recording-note calculator-currency-help">${p.t('calc.currency.help', 'All amounts use this currency. Changing it does not convert values.')}</p>`;
}

export function captureViewScroll(root) {
  return ['.compound-tool-chart-scroll', '.table-scroll'].map((selector) => ({
    selector,
    offsets: [...root.querySelectorAll(selector)].map((node) => [
      node.scrollTop || 0,
      node.scrollLeft || 0,
    ]),
  }));
}
export function restoreViewScroll(root, saved) {
  for (const { selector, offsets } of saved ?? [])
    [...root.querySelectorAll(selector)].forEach((node, index) => {
      if (offsets[index]) [node.scrollTop, node.scrollLeft] = offsets[index];
    });
}
