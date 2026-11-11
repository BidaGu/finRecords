import {
  RECORDING_FORMAT,
  RECORDING_VERSION,
  assert,
  clone,
  uid,
  now,
  assertId,
  assertArray,
  allowedKeys,
  validateMetadata,
} from '../core/values.mjs';
import {
  validateRecords,
  saveCategory,
  deleteCategory,
  saveEntry,
  deleteEntry,
} from '../core/records.mjs';
import { validateAccounts, saveAccount, deleteAccount } from '../core/accounts.mjs';
import { validateTransfers, saveTransfer, deleteTransfer } from '../core/transfers.mjs';
import { validateAccountBalances } from '../core/account-ledger.mjs';
import { validateCreditCards, saveStatement, deleteStatement } from '../behaviors/credit-card.mjs';
import {
  validateInvestments,
  savePurchase,
  deletePurchase,
  saveDisposal,
  deleteDisposal,
} from '../behaviors/investment.mjs';

const arrays = [
  'accounts',
  'categories',
  'entries',
  'transfers',
  'holdings',
  'investmentActivities',
  'statements',
  'entryOrder',
];
export function createDocument() {
  const stamp = now();
  return {
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    ledger: {
      id: uid('ledger'),
      currency: 'USD',
      createdAt: stamp,
      updatedAt: stamp,
      ...Object.fromEntries(arrays.map((key) => [key, []])),
    },
    settings: { analysisPresets: [], recordOrder: 'activity' },
  };
}
export function validateSettings(settings, ledger) {
  allowedKeys(settings, ['analysisPresets', 'recordOrder'], 'Selection settings');
  assertArray(settings.analysisPresets, 'Analysis presets');
  assert(
    ['activity', 'custom'].includes(settings.recordOrder ?? 'activity'),
    'Choose a valid record order.',
  );
  assert(settings.analysisPresets.length <= 100, 'Use at most 100 analysis presets.');
  const ids = new Set(),
    names = new Set(),
    entries = new Set(ledger.entries.map((entry) => entry.id));
  for (const preset of settings.analysisPresets) {
    allowedKeys(preset, ['id', 'name', 'entryIds'], 'Analysis preset');
    assertId(preset.id, 'Preset ID');
    assert(!ids.has(preset.id), 'Preset IDs must be unique.');
    ids.add(preset.id);
    assert(
      typeof preset.name === 'string' && preset.name.trim().length > 0 && preset.name.length <= 80,
      'Preset name must contain 1–80 characters.',
    );
    const key = preset.name.trim().toLocaleLowerCase('en-US');
    assert(!names.has(key), 'Preset names must be unique.');
    names.add(key);
    assertArray(preset.entryIds, 'Preset entry IDs');
    assert(
      new Set(preset.entryIds).size === preset.entryIds.length &&
        preset.entryIds.every((id) => entries.has(id)),
      'A preset must reference existing entries once each.',
    );
  }
  return settings;
}
export function validateDocument(input) {
  assert(
    input?.format === RECORDING_FORMAT && input.version === RECORDING_VERSION,
    'Open a supported Finance Records JSON file. Older formats are not converted automatically.',
  );
  allowedKeys(input, ['format', 'version', 'ledger', 'settings'], 'Document');
  const doc = clone(input),
    ledger = doc.ledger;
  allowedKeys(ledger, ['id', 'currency', 'createdAt', 'updatedAt', ...arrays], 'Financial ledger');
  validateMetadata(ledger);
  assert(ledger.currency === 'USD', 'This app supports USD only.');
  for (const key of arrays) assertArray(ledger[key], key);
  validateAccounts(ledger);
  validateRecords(ledger);
  validateTransfers(ledger);
  const accountIds = new Set(ledger.accounts.map((account) => account.id));
  for (const entry of ledger.entries) {
    assert(accountIds.has(entry.accountId), 'Every entry must link to an existing account.');
    const account = ledger.accounts.find((item) => item.id === entry.accountId);
    assert(
      entry.postedDate >= account.openedDate,
      'An entry posting date cannot precede its account opening date.',
    );
  }
  const allIds = new Set();
  for (const key of arrays.filter((key) => key !== 'entryOrder'))
    for (const item of ledger[key]) {
      assert(!allIds.has(item.id), 'Financial record IDs must be unique across the ledger.');
      allIds.add(item.id);
    }
  validateAccountBalances(ledger);
  validateCreditCards(ledger);
  validateInvestments(ledger);
  validateSettings(doc.settings, ledger);
  return doc;
}
function substantive(value) {
  if (Array.isArray(value)) return value.map(substantive);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'updatedAt')
        .map(([key, item]) => [key, substantive(item)]),
    );
  return value;
}
export function applyCommand(input, command) {
  const current = validateDocument(input);
  assert(command && typeof command.type === 'string', 'Choose an edit operation.');
  let ledger = current.ledger;
  const value = command.value;
  switch (command.type) {
    case 'account.save':
      ledger = saveAccount(ledger, value);
      break;
    case 'account.delete':
      ledger = deleteAccount(ledger, command.id);
      break;
    case 'category.save':
      ledger = saveCategory(ledger, value);
      break;
    case 'category.delete':
      ledger = deleteCategory(ledger, command.id, command.replacementId);
      break;
    case 'entry.save':
      ledger = saveEntry(ledger, value);
      break;
    case 'entry.delete':
      ledger = deleteEntry(ledger, command.id);
      break;
    case 'entry.copy': {
      const original = ledger.entries.find((entry) => entry.id === command.id);
      assert(original, 'Choose an existing entry to duplicate.');
      const copy = { ...original, ...value, id: uid('entry'), createdAt: now(), updatedAt: now() };
      ledger = saveEntry(ledger, copy);
      const order = ledger.entryOrder.filter((id) => id !== copy.id);
      order.splice(order.indexOf(original.id), 0, copy.id);
      ledger.entryOrder = order;
      current.settings.recordOrder = 'custom';
      break;
    }
    case 'entries.assign': {
      assertArray(command.ids, 'Selected entries');
      assert(
        command.ids.every((id) => ledger.entries.some((entry) => entry.id === id)),
        'Choose existing entries.',
      );
      for (const id of command.ids)
        ledger = saveEntry(ledger, {
          ...ledger.entries.find((entry) => entry.id === id),
          accountId: command.accountId,
          updatedAt: undefined,
        });
      break;
    }
    case 'entries.reorder':
      ledger = clone(ledger);
      ledger.entryOrder = clone(command.ids);
      current.settings.recordOrder = 'custom';
      break;
    case 'entries.sort':
      current.settings.recordOrder = 'activity';
      break;
    case 'transfer.save':
      ledger = saveTransfer(ledger, value);
      break;
    case 'transfer.delete':
      ledger = deleteTransfer(ledger, command.id);
      break;
    case 'statement.save':
      ledger = saveStatement(ledger, value);
      break;
    case 'statement.delete':
      ledger = deleteStatement(ledger, command.id);
      break;
    case 'purchase.save':
      ledger = savePurchase(ledger, value);
      break;
    case 'purchase.delete':
      ledger = deletePurchase(ledger, command.id);
      break;
    case 'disposal.save':
      ledger = saveDisposal(ledger, value);
      break;
    case 'disposal.delete':
      ledger = deleteDisposal(ledger, command.id);
      break;
    default:
      assert(false, 'Unknown recording operation.');
  }
  // Validate the whole candidate: references retained by the old account/activity
  // remain visible even when an entry is reassigned or removed.
  const next = { ...current, ledger };
  const stamp = now();
  for (const key of arrays.filter((key) => key !== 'entryOrder')) {
    const before = new Map(input.ledger[key].map((row) => [row.id, row]));
    next.ledger[key] = next.ledger[key].map((row) => {
      const previous = before.get(row.id);
      if (!previous) return row;
      return JSON.stringify(substantive(row)) === JSON.stringify(substantive(previous))
        ? clone(previous)
        : { ...row, createdAt: previous.createdAt, updatedAt: stamp };
    });
  }
  const live = new Set(ledger.entries.map((entry) => entry.id));
  next.settings.analysisPresets = next.settings.analysisPresets.map((preset) => ({
    ...preset,
    entryIds: preset.entryIds.filter((id) => live.has(id)),
  }));
  const validated = validateDocument(next);
  if (JSON.stringify(substantive(validated)) === JSON.stringify(substantive(input)))
    return clone(input);
  if (JSON.stringify(substantive(validated.ledger)) !== JSON.stringify(substantive(input.ledger)))
    validated.ledger.updatedAt = now();
  else validated.ledger = clone(input.ledger);
  return validated;
}
