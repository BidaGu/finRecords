import { ValidationError } from '../core/values.mjs';
import { orderedEntries } from '../core/records.mjs';
import { RECORDING_FORMAT, RECORDING_VERSION } from '../core/values.mjs';

const MAX_BYTES = 50 * 1024 * 1024;
export function parseDocumentJSON(text) {
  if (typeof text !== 'string')
    throw new ValidationError('Choose a JSON text file.', {
      code: 'errors.services.file-io.choose-a-json-text-file',
    });
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new ValidationError('Choose a JSON file smaller than 50 MB.', {
      code: 'errors.services.file-io.choose-a-json-file-smaller-than-50-mb',
    });
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new ValidationError(
      'The file is not valid JSON. Your current records have not changed.',
      {
        code: 'errors.services.file-io.the-file-is-not-valid-json-your-current-records-have-not-changed',
      },
    );
  }
  if (parsed?.format !== RECORDING_FORMAT || parsed.version !== RECORDING_VERSION)
    throw new ValidationError(
      'Open a supported Finance Records JSON file. Older formats are not converted automatically.',
      {
        code: 'errors.services.file-io.open-a-supported-finance-records-json-file-older-formats-are-not-converted-automatic',
      },
    );
  return parsed;
}
export function serializeDocumentJSON(document) {
  if (document?.format !== RECORDING_FORMAT || document.version !== RECORDING_VERSION)
    throw new ValidationError('Save a supported Finance Records document.', {
      code: 'errors.services.file-io.save-a-supported-finance-records-document',
    });
  return JSON.stringify(document, null, 2) + '\n';
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function decimalAmount(cents) {
  const value = BigInt(cents),
    negative = value < 0n,
    absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function toCSV(document, { t = (_key, fallback) => fallback } = {}) {
  const { ledger } = document;
  const categories = new Map(ledger.categories.map((category) => [category.id, category.label]));
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  const ordered = orderedEntries(ledger, document.settings.recordOrder);
  const rows = [
    [
      t('csv.id', 'ID'),
      t('csv.activityDate', 'Activity date'),
      t('csv.activityDateUnconfirmed', 'Activity date unconfirmed'),
      t('csv.postedDate', 'Posting date'),
      t('csv.postedDateUnconfirmed', 'Posting date unconfirmed'),
      t('csv.type', 'Type'),
      t('csv.category', 'Category'),
      t('csv.account', 'Account'),
      t('csv.merchant', 'Merchant or source'),
      t('csv.note', 'Note'),
      t('csv.amount', 'Amount {currency}', { currency: ledger.currency }).replace(
        '{currency}',
        ledger.currency,
      ),
    ],
    ...ordered.map((entry) => [
      entry.id,
      entry.activityDate,
      Boolean(entry.activityDateUnconfirmed),
      entry.postedDate,
      Boolean(entry.postedDateUnconfirmed),
      entry.kind,
      categories.get(entry.categoryId),
      accounts.get(entry.accountId),
      entry.merchant,
      entry.note,
      decimalAmount(entry.amountCents),
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export async function readJSONFile(file) {
  if (!file || file.size > MAX_BYTES)
    throw new ValidationError('Choose a JSON file smaller than 50 MB.', {
      code: 'errors.services.file-io.choose-a-json-file-smaller-than-50-mb',
    });
  return parseDocumentJSON(await file.text());
}
export function downloadText(text, name, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function chooseDirectFile({ description = 'Recording JSON' } = {}) {
  if (!globalThis.showOpenFilePicker)
    throw new ValidationError(
      'Direct editing is unavailable in this browser. Use Open JSON and Save.',
      {
        code: 'errors.services.file-io.direct-editing-is-unavailable-in-this-browser-use-open-json-and-save',
      },
    );
  const [handle] = await globalThis.showOpenFilePicker({
    types: [{ description, accept: { 'application/json': ['.json'] } }],
  });
  return { handle, file: await handle.getFile() };
}
export async function writeDirectFile(handle, text) {
  const writer = await handle.createWritable();
  try {
    await writer.write(text);
    await writer.close();
  } catch (error) {
    try {
      await writer.abort();
    } catch {}
    throw error;
  }
}
