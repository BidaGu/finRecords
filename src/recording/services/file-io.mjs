import { orderedEntries } from '../core/records.mjs';
import { RECORDING_FORMAT, RECORDING_VERSION } from '../core/values.mjs';

const MAX_BYTES = 50 * 1024 * 1024;
export function parseDocumentJSON(text) {
  if (typeof text !== 'string') throw new Error('Choose a JSON text file.');
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error('Choose a JSON file smaller than 50 MB.');
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('The file is not valid JSON. Your current records have not changed.');
  }
  if (parsed?.format !== RECORDING_FORMAT || parsed.version !== RECORDING_VERSION)
    throw new Error(
      'Open a supported Finance Records JSON file. Older formats are not converted automatically.',
    );
  return parsed;
}
export function serializeDocumentJSON(document) {
  if (document?.format !== RECORDING_FORMAT || document.version !== RECORDING_VERSION)
    throw new Error('Save a supported Finance Records document.');
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
export function toCSV(document) {
  const { ledger } = document;
  const categories = new Map(ledger.categories.map((category) => [category.id, category.label]));
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  const ordered = orderedEntries(ledger, document.settings.recordOrder);
  const rows = [
    [
      'ID',
      'Activity date',
      'Activity date unconfirmed',
      'Posting date',
      'Posting date unconfirmed',
      'Type',
      'Category',
      'Account',
      'Merchant or source',
      'Note',
      'Amount USD',
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
  if (!file || file.size > MAX_BYTES) throw new Error('Choose a JSON file smaller than 50 MB.');
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
export async function chooseDirectFile() {
  if (!globalThis.showOpenFilePicker)
    throw new Error('Direct editing is unavailable in this browser. Use Open JSON and Save.');
  const [handle] = await globalThis.showOpenFilePicker({
    types: [{ description: 'Recording JSON', accept: { 'application/json': ['.json'] } }],
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
