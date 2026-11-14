import { createDocument, validateDocument, applyCommand } from './services/editing-coordinator.mjs';
import { createSession } from './services/session.mjs';
import {
  readJSONFile,
  serializeDocumentJSON,
  toCSV,
  downloadText,
  chooseDirectFile,
  writeDirectFile,
} from './services/file-io.mjs';
import { createRecordsUI } from './ui/records-ui.mjs';
import { createAccountsUI } from './ui/accounts-ui.mjs';
import { createTransfersUI } from './ui/transfers-ui.mjs';
import { createStatementsUI } from './ui/statements-ui.mjs';
import { createInvestmentsUI } from './ui/investments-ui.mjs';
import { createSelectionPresets } from './ui/selection-presets.mjs';
import { createEntryAnalysisUI } from './ui/entry-analysis-ui.mjs';
import { createAccountAnalysisUI } from './ui/account-analysis-ui.mjs';
import { createCalculatorWorkspace } from './ui/calculators/workspace.mjs';
import { showForm, field, esc } from './ui/shared-controls.mjs';
import { createLocalization } from './ui/localization.mjs';
import { createPresentation } from './ui/formatting.mjs';

const $ = (id) => document.getElementById(id);
const localization = createLocalization();
const presentations = new Map();
const presentationFor = (currency = 'USD') => {
  const language = localization.getLanguage(),
    key = `${language}/${currency}`;
  if (!presentations.has(key)) presentations.set(key, createPresentation({ language, currency }));
  return presentations.get(key);
};
const t = (...args) => presentationFor().t(...args);
let ledgerCurrency = 'USD',
  lastNotice = null;
const session = createSession(createDocument(), {
  validate: validateDocument,
  execute: applyCommand,
  onListenerError: (error) => {
    console.error(error);
    ctx.notify(
      {
        code: 'app.refreshFailed',
        message:
          'The financial edit was accepted, but a screen could not refresh. Save your JSON before reloading.',
      },
      true,
    );
  },
});
const workspaceTabs = ['accounts', 'records', 'analysis', 'calculators'];
const analysisTabs = ['accounts', 'records'];
let activeTab = 'accounts',
  activeAnalysisTab = 'accounts',
  screens = [],
  initialized = false;
const ctx = {
  accountId: '',
  getDocument: () => session.snapshot(),
  getStatus: () => session.getStatus(),
  getPresentation: () => presentationFor(ledgerCurrency),
  command: (command) => session.command(command),
  updateSettings: (settings) => session.updateSettings(settings),
  render: () => render(),
  notify: (message, error = false) => {
    lastNotice = message ? { message, error } : null;
    $('message').textContent = presentationFor().error(message);
    $('message').hidden = !message;
    $('message').className = error ? 'message message-error' : 'message';
    $('message').setAttribute('role', error ? 'alert' : 'status');
  },
  selectAccount: (id) => {
    ctx.accountId = id;
    render();
  },
  navigate: (tab) => navigate(tab),
};
const selection = createSelectionPresets(ctx);
ctx.selection = selection;
const accounts = createAccountsUI(ctx),
  investments = createInvestmentsUI(ctx);
const transfers = createTransfersUI(ctx),
  statements = createStatementsUI(ctx),
  records = createRecordsUI(ctx);
const entryAnalysis = createEntryAnalysisUI(
  Object.freeze({
    getDocument: () => session.snapshot(),
    getSelectedEntryIds: () => selection.selectedIds(),
    navigate: (tab) => navigate(tab),
    isActive: () => activeTab === 'analysis' && activeAnalysisTab === 'records',
    getPresentation: () => presentationFor(ledgerCurrency),
  }),
);
const accountAnalysis = createAccountAnalysisUI(
  Object.freeze({
    getDocument: () => session.snapshot(),
    isActive: () => activeTab === 'analysis' && activeAnalysisTab === 'accounts',
    getPresentation: () => presentationFor(ledgerCurrency),
  }),
);
const calculators = createCalculatorWorkspace(
  Object.freeze({
    isActive: () => activeTab === 'calculators',
    getPresentation: presentationFor,
    onBusyChange: () => updateLanguageAvailability(),
  }),
);
screens = [
  accounts,
  investments,
  transfers,
  statements,
  records,
  entryAnalysis,
  accountAnalysis,
  calculators,
];
ctx.showEntry = (...args) => {
  navigate('records');
  return records.showEntry(...args);
};
ctx.showAccount = (id) => accounts.showAccount(id);
ctx.showStatement = (id) => {
  navigate('accounts');
  accounts.activateTab('statements');
  return statements.showDetails(id);
};
ctx.showInvestment = (id) => {
  navigate('accounts');
  accounts.activateTab('balances');
  const doc = session.snapshot();
  const activity = doc.ledger.investmentActivities.find((item) => item.id === id);
  if (activity) {
    ctx.accountId = activity.accountId;
    render();
    investments.showDisposal(id, activity.holdingId);
  }
};

function render() {
  if (!initialized) return;
  const status = session.getStatus();
  ledgerCurrency = session.snapshot().ledger.currency;
  translateShell();
  $('file-name').textContent = status.isUntitled
    ? t('shell.untitled', 'Untitled')
    : status.fileName;
  $('save-state').textContent = t(status.messageCode, status.message, status.messageParams);
  $('save-state').className = 'save-status' + (status.dirty ? ' is-unsaved' : '');
  $('storage-hint').textContent = t(
    'shell.storageHint',
    'Financial records stay in this tab until saved to JSON.',
  );
  if (lastNotice) $('message').textContent = presentationFor().error(lastNotice.message);
  selection.ensureDocument();
  selection.render();
  for (const name of analysisTabs) {
    const selected = name === activeAnalysisTab;
    $(`analysis-tab-${name}`).setAttribute('aria-selected', String(selected));
    $(`analysis-tab-${name}`).tabIndex = selected ? 0 : -1;
    $(`analysis-${name}-panel`).hidden = !selected;
  }
  for (const screen of screens) screen.render();
  for (const id of [
    'new-file',
    'open-file',
    'save-file',
    'save-as',
    'download-json',
    'export-csv',
    'open-direct',
    'save-direct',
  ])
    if ($(id)) $(id).disabled = status.busy;
  document.body.classList.toggle('is-busy', status.busy);
  updateLanguageAvailability();
}
const shellFallbacks = new WeakMap();
function translateShell() {
  document.documentElement.lang = localization.getLanguage();
  document.title = t('shell.title', 'Finance Records');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    if (!shellFallbacks.has(element)) shellFallbacks.set(element, element.textContent);
    element.textContent = t(element.getAttribute('data-i18n'), shellFallbacks.get(element));
  }
  for (const attribute of ['aria-label', 'title'])
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      const key = element.getAttribute(`data-i18n-${attribute}`);
      element.setAttribute(attribute, t(key, element.getAttribute(attribute) ?? ''));
    }
  if ($('ledger-currency')) {
    $('ledger-currency').textContent = ledgerCurrency;
    $('ledger-currency').title =
      ledgerCurrency === 'CNY'
        ? t('currency.cny', 'CNY · RMB')
        : t('currency.usd', 'USD · US dollar');
  }
  if ($('language-select')) $('language-select').value = localization.getLanguage();
}
function updateLanguageAvailability() {
  const control = $('language-select');
  if (!control) return;
  const disabled = Boolean(
    session.getStatus().busy || document.querySelector('dialog[open]') || calculators.isBusy?.(),
  );
  if (control.disabled !== disabled) control.disabled = disabled;
}
function refreshLanguage() {
  const focus = document.activeElement,
    id = focus?.id,
    start = focus?.selectionStart,
    end = focus?.selectionEnd;
  const positions = [
    ...document.querySelectorAll('.table-scroll, .entry-analysis-chart-scroll, .stock-sale-lots'),
  ].map((element) => [element.scrollLeft, element.scrollTop]);
  render();
  [
    ...document.querySelectorAll('.table-scroll, .entry-analysis-chart-scroll, .stock-sale-lots'),
  ].forEach((element, index) => {
    if (positions[index]) [element.scrollLeft, element.scrollTop] = positions[index];
  });
  const restored = id ? $(id) : null;
  restored?.focus({ preventScroll: true });
  if (Number.isInteger(start) && Number.isInteger(end)) restored?.setSelectionRange?.(start, end);
}
function navigate(tab) {
  activeTab = workspaceTabs.includes(tab) ? tab : 'accounts';
  for (const name of workspaceTabs) {
    const selected = name === activeTab;
    $(`tab-${name}`).setAttribute('aria-selected', String(selected));
    $(`tab-${name}`).tabIndex = selected ? 0 : -1;
    $(`${name}-panel`).hidden = !selected;
  }
  render();
}
for (const tab of workspaceTabs) $(`tab-${tab}`).addEventListener('click', () => navigate(tab));
document.querySelector('.workspace-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? workspaceTabs.length - 1
        : (workspaceTabs.indexOf(activeTab) + direction + workspaceTabs.length) %
          workspaceTabs.length;
  const tab = workspaceTabs[index];
  navigate(tab);
  $(`tab-${tab}`).focus();
});
function selectAnalysisTab(tab) {
  activeAnalysisTab = analysisTabs.includes(tab) ? tab : 'accounts';
  render();
}
for (const tab of analysisTabs)
  $(`analysis-tab-${tab}`).addEventListener('click', () => selectAnalysisTab(tab));
document.querySelector('.analysis-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tab =
    event.key === 'Home'
      ? 'accounts'
      : event.key === 'End'
        ? 'records'
        : activeAnalysisTab === 'accounts'
          ? 'records'
          : 'accounts';
  selectAnalysisTab(tab);
  $(`analysis-tab-${tab}`).focus();
});
function resetScreens() {
  activeAnalysisTab = 'accounts';
  for (const screen of screens) screen.reset?.();
}
function confirmDiscard() {
  if (!session.getStatus().dirty) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const view = showForm({
      presentation: presentationFor(ledgerCurrency),
      title: t('app.unsavedTitle', 'Unsaved changes'),
      content: `<p>${esc(t('app.unsavedHelp', 'Save your current ledger before opening another file, or continue and discard the unsaved changes.'))}</p>`,
      submitLabel: t('app.discard', 'Discard changes'),
      onSave: () => {
        settled = true;
        view.dialog.close();
        resolve(true);
      },
      onClose: () => {
        if (!settled) resolve(false);
        updateLanguageAvailability();
      },
    });
    updateLanguageAvailability();
  });
}
async function acceptFile(file, handle = null) {
  const candidate = validateDocument(await readJSONFile(file));
  if (!(await confirmDiscard())) return;
  ctx.accountId = '';
  session.replace(candidate, {
    fileName: file.name,
    handle,
    message: 'File opened',
    messageCode: 'session.opened',
  });
  selection.reset();
  resetScreens();
  navigate('accounts');
  ctx.notify('');
}
async function fileAction(action) {
  if (session.getStatus().busy) return;
  session.setBusy(true);
  try {
    return await action();
  } catch (error) {
    if (error.name !== 'AbortError') ctx.notify(error, true);
    return false;
  } finally {
    session.setBusy(false);
  }
}
$('new-file').addEventListener('click', async () => {
  if (session.getStatus().busy || document.querySelector('dialog[open]')) return;
  if (!(await confirmDiscard())) return;
  const candidate = await new Promise((resolve) => {
    let accepted = false;
    const view = showForm({
      presentation: presentationFor(ledgerCurrency),
      title: t('app.newTitle', 'New file'),
      content: `<label class="form-field">${esc(t('app.newCurrency', 'Ledger currency'))}<select name="currency" id="new-ledger-currency"><option value="USD">${esc(t('currency.usd', 'USD · US dollar'))}</option><option value="CNY">${esc(t('currency.cny', 'CNY · RMB'))}</option></select></label><p class="recording-note">${esc(t('app.newCurrencyHelp', 'One currency applies to every account in this file. It cannot be changed later, and no exchange conversion is performed.'))}</p>`,
      submitLabel: t('app.createFile', 'Create file'),
      onSave(form) {
        const value = createDocument({ currency: form.elements.currency.value });
        accepted = true;
        view.dialog.close();
        resolve(value);
      },
      onClose() {
        if (!accepted) resolve(null);
        updateLanguageAvailability();
      },
    });
    updateLanguageAvailability();
  });
  if (!candidate) return;
  ctx.accountId = '';
  session.replace(candidate, {
    message: 'Not saved',
    messageCode: 'session.notSaved',
  });
  selection.reset();
  resetScreens();
  navigate('accounts');
  ctx.notify('');
});
$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => {
  const file = $('file-input').files[0];
  $('file-input').value = '';
  if (file) fileAction(() => acceptFile(file));
});
function fileName(value) {
  let name = String(value || 'recording-records.json')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-');
  if (!name.toLowerCase().endsWith('.json')) name += '.json';
  return name || 'recording-records.json';
}
async function save({ name, copy = false, direct = false } = {}) {
  return fileAction(async () => {
    const snapshot = validateDocument(session.snapshot()),
      status = session.getStatus();
    let handle = copy ? null : status.handle;
    if (direct && !handle)
      handle = await globalThis.showSaveFilePicker({
        suggestedName: fileName(name || (status.isUntitled ? '' : status.fileName)),
        types: [
          {
            description: t('app.fileType', 'Recording JSON'),
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
    const text = serializeDocumentJSON(snapshot);
    if (handle && !copy) {
      await writeDirectFile(handle, text);
      session.markSaved({ name: handle.name, fileHandle: handle, savedDocument: snapshot });
      ctx.notify({ code: 'app.jsonSaved', message: 'JSON saved.' });
    } else {
      const target = fileName(name || (status.isUntitled ? '' : status.fileName));
      downloadText(text, target);
      session.markSaved({ name: target, downloaded: true });
      ctx.notify({
        code: 'app.copyDownloaded',
        message:
          'JSON copy downloaded. Keep it in your synced data folder; the browser cannot verify where a download was stored.',
      });
    }
    return true;
  });
}
$('save-file').addEventListener('click', () => save());
$('download-json').addEventListener('click', () => save({ copy: true }));
$('save-as').addEventListener('click', () => {
  const view = showForm({
    presentation: presentationFor(ledgerCurrency),
    title: t('app.saveCopyTitle', 'Save a JSON copy'),
    content: field(
      t('app.filename', 'Filename'),
      'filename',
      fileName(session.getStatus().isUntitled ? '' : session.getStatus().fileName),
      {
        required: true,
      },
    ),
    submitLabel: t('app.downloadJSON', 'Download JSON'),
    onSave: async (form) => {
      if (await save({ name: new FormData(form).get('filename'), copy: true })) view.dialog.close();
    },
  });
});
$('export-csv').addEventListener('click', () => {
  try {
    downloadText(
      toCSV(validateDocument(session.snapshot()), { t }),
      'recording-entries.csv',
      'text/csv;charset=utf-8',
    );
    ctx.notify({
      code: 'app.csvExported',
      message:
        'All Gain/Expense entries exported to CSV. Transfers and investment principal are excluded.',
    });
  } catch (error) {
    ctx.notify(error, true);
  }
});
if ($('open-direct')) {
  $('open-direct').hidden = !globalThis.showOpenFilePicker;
  $('open-direct').addEventListener('click', () =>
    fileAction(async () => {
      const { handle, file } = await chooseDirectFile({
        description: t('app.fileType', 'Recording JSON'),
      });
      await acceptFile(file, handle);
    }),
  );
}
if ($('save-direct')) {
  $('save-direct').hidden = !globalThis.showSaveFilePicker;
  $('save-direct').addEventListener('click', () => save({ direct: true }));
}
window.addEventListener('beforeunload', (event) => {
  if (session.getStatus().dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
session.subscribe(render);
localization.subscribe(refreshLanguage);
$('language-select')?.addEventListener('change', () => {
  if (
    session.getStatus().busy ||
    document.querySelector('dialog[open]') ||
    calculators.isBusy?.()
  ) {
    $('language-select').value = localization.getLanguage();
    return;
  }
  localization.setLanguage($('language-select').value);
});
if (typeof globalThis.MutationObserver === 'function')
  new globalThis.MutationObserver(updateLanguageAvailability).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open', 'aria-busy'],
  });
initialized = true;
navigate('accounts');
