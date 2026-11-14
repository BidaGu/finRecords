import english from './locales/en.mjs';
import chinese from './locales/zh-CN.mjs';

export const LANGUAGE_STORAGE_KEY = 'finance-records.ui-language.v1';
export const LANGUAGES = Object.freeze(['en', 'zh-CN']);
const catalogs = { en: english, 'zh-CN': chinese };
export function createTranslator(language = 'en') {
  const catalog = catalogs[language] ?? english;
  return (key, fallback = key, parameters = {}) => {
    const message = Object.hasOwn(catalog, key)
      ? catalog[key]
      : Object.hasOwn(english, key)
        ? english[key]
        : fallback;
    return String(message).replace(/\{([\w]+)\}/g, (match, name) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : match,
    );
  };
}

export function createLocalization(options = {}) {
  const storage = () =>
    Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
  const browserLanguages = options.languages ?? globalThis.navigator?.languages ?? [];
  const preferred = browserLanguages.find((value) =>
    /^en(?:-|$)|^zh-(?:cn|sg|hans)(?:-|$)/i.test(value),
  );
  let language = /^zh-/i.test(preferred ?? '') ? 'zh-CN' : 'en',
    persistent = true;
  try {
    const saved = storage()?.getItem(LANGUAGE_STORAGE_KEY);
    if (LANGUAGES.includes(saved)) language = saved;
    if (!storage()) persistent = false;
  } catch {
    persistent = false;
  }
  if (LANGUAGES.includes(options.language)) language = options.language;
  const listeners = new Set();
  return Object.freeze({
    getLanguage: () => language,
    getStatus: () => Object.freeze({ persistent }),
    t: (key, fallback, parameters) => createTranslator(language)(key, fallback, parameters),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLanguage(value) {
      if (!LANGUAGES.includes(value))
        throw new RangeError('Choose a supported interface language.');
      if (value === language) return false;
      language = value;
      try {
        if (!storage()) throw new Error('Language storage is unavailable.');
        storage().setItem(LANGUAGE_STORAGE_KEY, value);
        persistent = true;
      } catch {
        persistent = false;
      }
      for (const listener of listeners) listener(language);
      return true;
    },
  });
}
