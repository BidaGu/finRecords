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

const $ = (id) => document.getElementById(id);
const session = createSession(createDocument(), {
  validate: validateDocument,
  execute: applyCommand,
  onListenerError: (error) => {
    console.error(error);
    ctx.notify(
      'The financial edit was accepted, but a screen could not refresh. Save your JSON before reloading.',
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
  command: (command) => session.command(command),
  updateSettings: (settings) => session.updateSettings(settings),
  render: () => render(),
  notify: (message, error = false) => {
    $('message').textContent = message;
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
  }),
);
const accountAnalysis = createAccountAnalysisUI(
  Object.freeze({
    getDocument: () => session.snapshot(),
    isActive: () => activeTab === 'analysis' && activeAnalysisTab === 'accounts',
  }),
);
const calculators = createCalculatorWorkspace(
  Object.freeze({ isActive: () => activeTab === 'calculators' }),
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
  $('file-name').textContent = status.fileName;
  $('save-state').textContent = status.message;
  $('save-state').className = 'save-status' + (status.dirty ? ' is-unsaved' : '');
  $('storage-hint').textContent = 'Financial records stay in this tab until saved to JSON.';
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
      title: 'Unsaved changes',
      content:
        '<p>Save your current ledger before opening another file, or continue and discard the unsaved changes.</p>',
      submitLabel: 'Discard changes',
      onSave: () => {
        settled = true;
        view.dialog.close();
        resolve(true);
      },
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
  });
}
async function acceptFile(file, handle = null) {
  const candidate = validateDocument(await readJSONFile(file));
  if (!(await confirmDiscard())) return;
  ctx.accountId = '';
  session.replace(candidate, { fileName: file.name, handle, message: 'File opened' });
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
    if (error.name !== 'AbortError')
      ctx.notify(error.message || 'The file operation failed.', true);
    return false;
  } finally {
    session.setBusy(false);
  }
}
$('new-file').addEventListener('click', async () => {
  if (!(await confirmDiscard())) return;
  ctx.accountId = '';
  session.replace(createDocument(), { message: 'Not saved' });
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
  let name = String((value === 'Untitled' ? '' : value) || 'recording-records.json')
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
        suggestedName: fileName(name || status.fileName),
        types: [{ description: 'Recording JSON', accept: { 'application/json': ['.json'] } }],
      });
    const text = serializeDocumentJSON(snapshot);
    if (handle && !copy) {
      await writeDirectFile(handle, text);
      session.markSaved({ name: handle.name, fileHandle: handle, savedDocument: snapshot });
      ctx.notify('JSON saved.');
    } else {
      const target = fileName(name || status.fileName);
      downloadText(text, target);
      session.markSaved({ name: target, downloaded: true });
      ctx.notify(
        'JSON copy downloaded. Keep it in your synced data folder; the browser cannot verify where a download was stored.',
      );
    }
    return true;
  });
}
$('save-file').addEventListener('click', () => save());
$('download-json').addEventListener('click', () => save({ copy: true }));
$('save-as').addEventListener('click', () => {
  const view = showForm({
    title: 'Save a JSON copy',
    content: field('Filename', 'filename', fileName(session.getStatus().fileName), {
      required: true,
    }),
    submitLabel: 'Download JSON',
    onSave: async (form) => {
      if (await save({ name: new FormData(form).get('filename'), copy: true })) view.dialog.close();
    },
  });
});
$('export-csv').addEventListener('click', () => {
  try {
    downloadText(
      toCSV(validateDocument(session.snapshot())),
      'recording-entries.csv',
      'text/csv;charset=utf-8',
    );
    ctx.notify(
      'All Gain/Expense entries exported to CSV. Transfers and investment principal are excluded.',
    );
  } catch (error) {
    ctx.notify(error.message, true);
  }
});
if ($('open-direct')) {
  $('open-direct').hidden = !globalThis.showOpenFilePicker;
  $('open-direct').addEventListener('click', () =>
    fileAction(async () => {
      const { handle, file } = await chooseDirectFile();
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
initialized = true;
navigate('accounts');
