export const CALCULATOR_PRESET_FORMAT = 'finance-calculator-presets';
export const CALCULATOR_PRESET_VERSION = '1.0.0';
export const CALCULATOR_PRESET_STORAGE_KEY = 'finance-records.calculator-presets.v1';
export const MAX_PRESET_BYTES = 256 * 1024;

const tabOnly = 'Presets are available only in this tab. Export presets to keep a backup.';
const record = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function requireRecord(value, label) {
  if (!record(value)) throw new Error(`${label} must be an object.`);
}
function copyJSON(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if ((!Array.isArray(value) && !record(value)) || ancestors.has(value))
    throw new Error('Calculator preset values must contain only ordinary JSON data.');
  ancestors.add(value);
  let copy;
  if (Array.isArray(value)) {
    copy = Array.from(value, (item, index) => {
      if (!Object.hasOwn(value, index))
        throw new Error('Calculator preset lists cannot contain missing items.');
      return copyJSON(item, ancestors);
    });
  } else {
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string'))
      throw new Error('Calculator preset values must use ordinary field names.');
    copy = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyJSON(item, ancestors)]),
    );
  }
  ancestors.delete(value);
  return copy;
}
function checkSize(text) {
  if (text.length > MAX_PRESET_BYTES || new TextEncoder().encode(text).length > MAX_PRESET_BYTES)
    throw new Error('Calculator preset files must be no larger than 256 KiB.');
}

/** One independent input snapshot per calculator; browser persistence is best effort. */
export function createCalculatorPresetStore(validators, options = {}) {
  requireRecord(validators, 'Calculator preset validators');
  const validate = new Map(Object.entries(validators));
  if (!validate.size || [...validate.values()].some((fn) => typeof fn !== 'function'))
    throw new Error('Each calculator needs a preset input validator.');
  const storage = () =>
    Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
  let presets = new Map(),
    persistent = false,
    warning = '';

  function known(toolId) {
    if (!validate.has(toolId)) throw new Error('Unknown calculator preset.');
  }
  function input(toolId, raw) {
    known(toolId);
    const result = validate.get(toolId)(copyJSON(raw));
    requireRecord(result, 'Calculator preset inputs');
    return copyJSON(result);
  }
  function encode(slots) {
    const envelope = {
      format: CALCULATOR_PRESET_FORMAT,
      version: CALCULATOR_PRESET_VERSION,
      presets: Object.fromEntries(
        [...validate.keys()].filter((id) => slots.has(id)).map((id) => [id, slots.get(id)]),
      ),
    };
    const text = `${JSON.stringify(envelope, null, 2)}\n`;
    checkSize(text);
    return text;
  }
  function decode(text) {
    if (typeof text !== 'string') throw new Error('Calculator preset input must be JSON text.');
    checkSize(text);
    let envelope;
    try {
      envelope = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('The calculator presets file is not valid JSON.');
    }
    requireRecord(envelope, 'Calculator presets file');
    const keys = Object.keys(envelope);
    if (
      keys.length !== 3 ||
      !['format', 'version', 'presets'].every((key) => Object.hasOwn(envelope, key))
    )
      throw new Error('Calculator preset files must contain only format, version, and presets.');
    if (envelope.format !== CALCULATOR_PRESET_FORMAT)
      throw new Error('This is not a calculator presets file.');
    if (envelope.version !== CALCULATOR_PRESET_VERSION)
      throw new Error('Calculator preset files require version "1.0.0".');
    requireRecord(envelope.presets, 'Saved calculator presets');
    return new Map(Object.entries(envelope.presets).map(([id, raw]) => [id, input(id, raw)]));
  }
  function unavailable(message) {
    persistent = false;
    warning = `${message} ${tabOnly}`;
  }
  function persist(text) {
    try {
      const target = storage();
      if (!target) throw new Error('Storage is unavailable.');
      target.setItem(CALCULATOR_PRESET_STORAGE_KEY, text);
      persistent = true;
      warning = '';
    } catch {
      unavailable('Calculator presets could not be saved in this browser.');
    }
  }
  try {
    const target = storage();
    if (!target) throw new Error('Storage is unavailable.');
    const saved = target.getItem(CALCULATOR_PRESET_STORAGE_KEY);
    if (saved !== null) {
      const loaded = decode(saved);
      encode(loaded);
      presets = loaded;
    }
    persistent = true;
  } catch {
    unavailable('Saved calculator presets could not be read in this browser.');
  }
  const getStatus = () => ({ persistent, warning });
  return {
    get(toolId) {
      known(toolId);
      return presets.has(toolId) ? copyJSON(presets.get(toolId)) : null;
    },
    save(toolId, raw) {
      const next = new Map(presets).set(toolId, input(toolId, raw)),
        text = encode(next);
      presets = next;
      persist(text);
      return getStatus();
    },
    clear(toolId) {
      known(toolId);
      const next = new Map(presets);
      next.delete(toolId);
      const text = encode(next);
      presets = next;
      persist(text);
      return getStatus();
    },
    importJSON(text) {
      const imported = decode(text),
        next = new Map([...presets, ...imported]),
        saved = encode(next);
      presets = next;
      persist(saved);
      return imported.size;
    },
    exportJSON: () => encode(presets),
    getStatus,
  };
}
