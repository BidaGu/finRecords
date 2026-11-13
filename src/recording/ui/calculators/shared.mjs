export const optionsHTML = (choices, value) =>
  choices
    .map(
      ([id, label]) => `<option value="${id}"${id === value ? ' selected' : ''}>${label}</option>`,
    )
    .join('');

export function formatDecimal(value, currency = false) {
  if (value === null || value === undefined) return '—';
  const [whole, fraction = ''] = String(value).split('.'),
    digits = fraction.replace(/0+$/, ''),
    shown = currency ? digits.padEnd(2, '0') : digits;
  return `${currency ? '$' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${shown ? `.${shown}` : ''}`;
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
