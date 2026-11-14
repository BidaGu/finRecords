import { createTranslator } from './localization.mjs';
import { assertCurrency } from '../core/values.mjs';
const presentations = new Map();

export function createPresentation({ language = 'en', currency = 'USD' } = {}) {
  if (!['en', 'zh-CN'].includes(language)) throw new RangeError('Unsupported language.');
  assertCurrency(currency);
  const cacheKey = `${language}/${currency}`;
  if (presentations.has(cacheKey)) return presentations.get(cacheKey);
  const locale = language === 'en' ? 'en-US' : 'zh-CN',
    t = createTranslator(language),
    numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const currencyLabel = (label) => {
    const text = String(label),
      suffix = language === 'zh-CN' ? `（${currency}）` : ` (${currency})`;
    return text.endsWith(suffix) ? text : text + suffix;
  };
  const decimal = (value, monetary = false) => {
    if (value === null || value === undefined) return '—';
    const raw = String(value),
      negative = raw.startsWith('-'),
      [whole, fraction = ''] = (negative ? raw.slice(1) : raw).split('.'),
      digits = fraction.replace(/0+$/, ''),
      shown = monetary ? digits.padEnd(2, '0') : digits,
      formatted = numbers.format(BigInt(whole || '0'));
    return `${negative ? '-' : ''}${formatted}${shown ? `.${shown}` : ''}`;
  };
  const money = (cents) => {
    let value = BigInt(cents ?? 0);
    const negative = value < 0n;
    if (negative) value = -value;
    return `${negative ? '-' : ''}${numbers.format(value / 100n)}.${String(value % 100n).padStart(2, '0')}`;
  };
  const error = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (!value.code && language === 'en') return value.message ?? 'The operation failed.';
    const params = { ...(value.params ?? {}) };
    if (language === 'zh-CN') {
      if (params.kind) params.kind = t(`types.${params.kind}`, params.kind);
      if (params.name) params.name = t(`fields.${params.name}`, params.name, params);
      if (params.index && value.code?.startsWith('errors.calculators.stock-sale.'))
        params.name = t('fields.stock-lot', params.name, params);
    }
    if (params.field && Object.hasOwn(params, 'label'))
      params.label = t(`fields.${params.field}`, params.label, params);
    if (value.fieldKey && Object.hasOwn(params, 'field'))
      params.field = t(value.fieldKey, params.field);
    return t(value.code ?? 'errors.unexpected', value.message ?? 'The operation failed.', params);
  };
  const presentation = Object.freeze({
    language,
    currency,
    t,
    money,
    currencyLabel,
    decimal,
    error,
    percent: (value) => (value === null || value === undefined ? '—' : `${value}%`),
    date: (value) => String(value ?? ''),
    month: (value) => String(value ?? ''),
    compareNames: (a, b) => String(a).localeCompare(String(b), locale, { sensitivity: 'base' }),
  });
  presentations.set(cacheKey, presentation);
  return presentation;
}
