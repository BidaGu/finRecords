import { scopedPresentation, calculatorError } from './shared.mjs';
import { createCompoundGrowthUI } from './compound-growth-ui.mjs';
import { createAverageCostUI } from './average-cost-ui.mjs';
import { createStockSaleUI } from './stock-sale-ui.mjs';
import { esc } from '../shared-controls.mjs';
import { createCalculatorPresetStore, MAX_PRESET_BYTES } from './presets.mjs';

const tools = Object.freeze([
  Object.freeze({
    id: 'compound-growth',
    label: 'Compound Growth',
    category: 'Growth',
    rootId: 'calculators-content',
    create: createCompoundGrowthUI,
  }),
  Object.freeze({
    id: 'average-cost',
    label: 'Average Cost',
    category: 'Stocks',
    rootId: 'target-average-cost-content',
    create: createAverageCostUI,
  }),
  Object.freeze({
    id: 'stock-sale',
    label: 'Sale Gain/Loss',
    category: 'Stocks',
    rootId: 'stock-sale-content',
    create: createStockSaleUI,
  }),
]);

function downloadPresetJSON(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'finance-calculator-presets.json';
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function createCalculatorWorkspace(ctx, options = {}) {
  const root = document.getElementById('calculator-workspace-content');
  let selectedToolId = tools[0].id;
  let currentPresentation;
  const presentation = (refresh = false) => {
    if (refresh || !currentPresentation)
      currentPresentation = scopedPresentation(ctx.getPresentation);
    return currentPresentation;
  };
  const t = (...args) => presentation().t(...args),
    toolLabel = (id) => {
      const tool = tools.find((item) => item.id === id);
      return t(`calc.tool.${id}`, tool.label);
    };
  const categories = [...new Set(tools.map((tool) => tool.category))];
  root.innerHTML = `<div class="calculator-workspace-toolbar calculator-preset-toolbar"><label class="compound-tool-schedule-control"><span id="calculator-picker-label">Calculator</span><select id="calculator-tool-select" aria-controls="calculator-tool-panels">${categories
    .map(
      (category) =>
        `<optgroup label="${esc(category)}">${tools
          .filter((tool) => tool.category === category)
          .map((tool) => `<option value="${tool.id}">${esc(tool.label)}</option>`)
          .join('')}</optgroup>`,
    )
    .join(
      '',
    )}</select></label><div class="calculator-preset-actions" role="group" aria-label="Preset for selected calculator"><button type="button" class="button button-outline" id="calculator-preset-save">Save preset</button><button type="button" class="button button-outline" id="calculator-preset-load">Load preset</button><button type="button" class="button button-outline" id="calculator-preset-clear">Clear preset</button></div><div class="calculator-preset-file-actions" role="group" aria-label="Preset files"><button type="button" class="button button-outline" id="calculator-presets-export">Export presets</button><button type="button" class="button button-outline" id="calculator-presets-import">Import presets</button><input type="file" id="calculator-presets-file" accept=".json,application/json" hidden></div></div><p class="recording-note calculator-preset-status" id="calculator-preset-status" role="status" aria-live="polite"></p><p class="recording-note calculator-preset-help" id="calculator-preset-help"></p><div id="calculator-tool-panels">${tools.map((tool) => `<section id="calculator-tool-${tool.id}-panel" role="region" aria-label="${esc(tool.label)} calculator"${tool.id === selectedToolId ? '' : ' hidden'}><div id="${tool.rootId}"></div></section>`).join('')}</div>`;
  const find = (id) => root.querySelector(`#${id}`),
    picker = find('calculator-tool-select'),
    controllers = new Map(
      tools.map((tool) => [
        tool.id,
        tool.create(
          Object.freeze({
            root: find(tool.rootId),
            isActive: () => ctx.isActive() && selectedToolId === tool.id,
            ...(ctx.getPresentation ? { getPresentation: ctx.getPresentation } : {}),
          }),
        ),
      ]),
    );
  const presets = createCalculatorPresetStore(
    Object.fromEntries(tools.map((tool) => [tool.id, controllers.get(tool.id).validatePreset])),
    Object.hasOwn(options, 'storage') ? { storage: options.storage } : {},
  );
  const download = options.download ?? downloadPresetJSON;
  let importing = false,
    lastMessage = null,
    messageIsError = false;
  function localizeChrome() {
    const labels = {
      'calculator-picker-label': ['calc.host.chooser', 'Calculator'],
      'calculator-preset-save': ['calc.host.save', 'Save preset'],
      'calculator-preset-load': ['calc.host.load', 'Load preset'],
      'calculator-preset-clear': ['calc.host.clear', 'Clear preset'],
      'calculator-presets-export': ['calc.host.export', 'Export presets'],
      'calculator-presets-import': ['calc.host.import', 'Import presets'],
      'calculator-preset-help': [
        'calc.host.help',
        'One saved input preset per calculator. Import replaces only presets included in the file; other presets and current forms stay unchanged.',
      ],
    };
    for (const [id, args] of Object.entries(labels)) find(id).textContent = t(...args);
    root
      .querySelector('.calculator-preset-actions')
      .setAttribute('aria-label', t('calc.host.slotGroup', 'Preset for selected calculator'));
    root
      .querySelector('.calculator-preset-file-actions')
      .setAttribute('aria-label', t('calc.host.fileGroup', 'Preset files'));
    picker
      .querySelectorAll('optgroup')
      .forEach((group, index) =>
        group.setAttribute(
          'label',
          t(`calc.category.${categories[index].toLowerCase()}`, categories[index]),
        ),
      );
    picker.querySelectorAll('option').forEach((option) => {
      option.textContent = toolLabel(option.value);
    });
    for (const tool of tools)
      find(`calculator-tool-${tool.id}-panel`).setAttribute(
        'aria-label',
        t('calc.host.region', '{tool} calculator', { tool: toolLabel(tool.id) }),
      );
  }
  function messageText(message) {
    if (!message) return '';
    const params = { ...(message.params ?? {}) };
    if (params.toolId) {
      params.tool = toolLabel(params.toolId);
      delete params.toolId;
    }
    if (params.reason) params.reason = presentation().error(params.reason);
    return t(message.code, message.message, params);
  }
  function syncPresetControls() {
    const saved = presets.get(selectedToolId) !== null;
    find('calculator-preset-save').disabled = importing;
    find('calculator-preset-load').disabled = importing || !saved;
    find('calculator-preset-clear').disabled = importing || !saved;
    find('calculator-presets-export').disabled =
      importing || !tools.some((tool) => presets.get(tool.id) !== null);
    find('calculator-presets-import').disabled = importing;
    const status = find('calculator-preset-status'),
      warning = presentation().error(presets.getWarning()),
      message = importing
        ? t('calc.host.importing', 'Importing calculator presets…')
        : lastMessage
          ? messageText(lastMessage)
          : saved
            ? t('calc.host.available', 'Preset available for {tool}.', {
                tool: toolLabel(selectedToolId),
              })
            : t('calc.host.none', 'No preset saved for {tool}.', {
                tool: toolLabel(selectedToolId),
              });
    status.textContent = message + (warning ? ` ${warning}` : '');
    status.setAttribute('role', messageIsError && !importing ? 'alert' : 'status');
    status.classList.toggle('calculator-preset-error', messageIsError && !importing);
  }
  function report(code, message, params = {}, error = false) {
    lastMessage = { code, message, params };
    messageIsError = error;
    syncPresetControls();
  }
  function syncSelection() {
    presentation(true);
    localizeChrome();
    picker.value = selectedToolId;
    for (const tool of tools)
      find(`calculator-tool-${tool.id}-panel`).hidden = tool.id !== selectedToolId;
    syncPresetControls();
  }
  function render() {
    if (!ctx.isActive()) return;
    syncSelection();
    controllers.get(selectedToolId).render();
  }
  function reset() {
    selectedToolId = tools[0].id;
    lastMessage = null;
    messageIsError = false;
    for (const controller of controllers.values()) controller.reset();
    syncSelection();
  }
  picker.addEventListener('change', () => {
    if (!ctx.isActive()) return;
    const requested = picker.value;
    if (!controllers.has(requested)) {
      syncSelection();
      return;
    }
    selectedToolId = requested;
    lastMessage = null;
    messageIsError = false;
    render();
  });
  find('calculator-preset-save').addEventListener('click', () => {
    if (!ctx.isActive() || importing) return;
    try {
      presets.save(selectedToolId, controllers.get(selectedToolId).capturePreset());
      report('calc.host.saved', 'Preset saved for {tool}.', { toolId: selectedToolId });
    } catch (reason) {
      report('calc.host.notSaved', 'Preset not saved: {reason}', { reason }, true);
    }
  });
  find('calculator-preset-load').addEventListener('click', () => {
    if (!ctx.isActive() || importing) return;
    try {
      const inputs = presets.get(selectedToolId);
      if (inputs === null) return;
      controllers.get(selectedToolId).applyPreset(inputs);
      report(
        'calc.host.loaded',
        'Preset loaded for {tool}. Choose Calculate to update the results.',
        { toolId: selectedToolId },
      );
    } catch (reason) {
      report('calc.host.notLoaded', 'Preset not loaded: {reason}', { reason }, true);
    }
  });
  find('calculator-preset-clear').addEventListener('click', () => {
    if (!ctx.isActive() || importing) return;
    try {
      presets.clear(selectedToolId);
      report('calc.host.cleared', 'Preset cleared for {tool}. Current inputs stay unchanged.', {
        toolId: selectedToolId,
      });
    } catch (reason) {
      report('calc.host.notCleared', 'Preset not cleared: {reason}', { reason }, true);
    }
  });
  find('calculator-presets-export').addEventListener('click', () => {
    if (!ctx.isActive() || importing) return;
    try {
      download(presets.exportJSON());
      report(
        'calc.host.exported',
        'Calculator presets exported. The file contains saved inputs only.',
      );
    } catch (reason) {
      report('calc.host.notExported', 'Presets not exported: {reason}', { reason }, true);
    }
  });
  const fileInput = find('calculator-presets-file');
  find('calculator-presets-import').addEventListener('click', () => {
    if (!ctx.isActive() || importing) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || importing) return;
    importing = true;
    messageIsError = false;
    ctx.onBusyChange?.();
    syncPresetControls();
    try {
      if (!Number.isFinite(file.size) || file.size > MAX_PRESET_BYTES)
        throw calculatorError(
          'calc.host.fileTooLarge',
          'Choose a calculator preset JSON file no larger than 256 KiB.',
        );
      const count = presets.importJSON(await file.text());
      lastMessage = {
        code: count === 1 ? 'calc.host.importedOne' : 'calc.host.importedMany',
        message:
          count === 1
            ? '{count} calculator preset imported. Current forms stay unchanged; choose Load preset to use one.'
            : '{count} calculator presets imported. Current forms stay unchanged; choose Load preset to use one.',
        params: { count },
      };
      messageIsError = false;
    } catch (reason) {
      lastMessage = {
        code: 'calc.host.notImported',
        message: 'Presets not imported: {reason}',
        params: { reason },
      };
      messageIsError = true;
    } finally {
      importing = false;
      ctx.onBusyChange?.();
      syncPresetControls();
    }
  });
  syncSelection();
  return { render, reset, isBusy: () => importing };
}
