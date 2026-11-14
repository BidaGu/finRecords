import { createUIHelpers } from './shared-controls.mjs';
import { $, esc, newId, field, showForm, confirmAction } from './shared-controls.mjs';

export function createSelectionPresets(ctx) {
  const {
    t: tr,
    error: localizeError,
    compareNames,
    unit,
    field,
    showForm,
    confirmAction,
  } = createUIHelpers(ctx);
  let documentId = null,
    selected = new Set(),
    known = new Set(),
    chosen = '',
    includedOnly = false;
  const getEntries = () => ctx.getDocument().ledger.entries;
  function ensureDocument() {
    const doc = ctx.getDocument(),
      ids = new Set(doc.ledger.entries.map((entry) => entry.id));
    if (documentId !== doc.ledger.id) {
      documentId = doc.ledger.id;
      selected = new Set(ids);
      known = new Set(ids);
      chosen = '';
      includedOnly = false;
    } else {
      for (const id of ids) if (!known.has(id)) selected.add(id);
      for (const id of selected) if (!ids.has(id)) selected.delete(id);
      known = ids;
    }
  }
  const presets = () => ctx.getDocument().settings.analysisPresets ?? [];
  function persist(list) {
    ctx.updateSettings({ ...ctx.getDocument().settings, analysisPresets: list });
  }
  function checkName(name, id) {
    if (!name || name.length > 80)
      throw Object.assign(new Error('Enter a preset name from 1 to 80 characters.'), {
        code: 'ui.presetNameLength',
        params: {},
      });
    if (presets().some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase()))
      throw Object.assign(new Error('A preset with that name already exists.'), {
        code: 'ui.presetNameDuplicate',
        params: {},
      });
  }
  function saveNew() {
    ensureDocument();
    showForm({
      title: tr('financial.save_analysis_preset_38128d', 'Save analysis preset'),
      content: field(tr('financial.preset_name_eb39e1', 'Preset name'), 'name', '', {
        required: true,
        attrs: 'maxlength="80"',
      }),
      submitLabel: tr('financial.save_preset_828897', 'Save preset'),
      onSave: (form, dialog) => {
        const name = form.elements.name.value.trim();
        checkName(name);
        const id = newId('preset');
        persist([...presets(), { id, name, entryIds: [...selected] }]);
        chosen = id;
        dialog.close();
        ctx.render();
      },
    });
  }
  function manage() {
    const preset = presets().find((p) => p.id === chosen);
    if (!preset) return;
    const { dialog, form, showError } = showForm({
      title: tr('financial.manage_analysis_preset_e12cf0', 'Manage analysis preset'),
      content: `${field(tr('financial.preset_name_eb39e1', 'Preset name'), 'name', preset.name, { required: true, attrs: 'maxlength="80"' })}<p class="recording-note">${preset.entryIds.length} ${esc(tr('financial.saved_entries_updating_replaces_the_saved_selection_with_t_8ad030', 'saved entries. Updating replaces the saved selection with the currently checked entries.'))}</p><div class="recording-mini-actions"><button type="button" class="button button-outline" data-update>${esc(tr('financial.update_selection_63d535', 'Update selection'))}</button><button type="button" class="button button-outline recording-danger" data-delete>${esc(tr('financial.delete_preset_1bc4b0', 'Delete preset'))}</button></div>`,
      submitLabel: tr('financial.rename_preset_52abbe', 'Rename preset'),
      onSave: (f, d) => {
        const name = f.elements.name.value.trim();
        checkName(name, preset.id);
        persist(presets().map((p) => (p.id === preset.id ? { ...p, name } : p)));
        d.close();
      },
    });
    form.querySelector('[data-update]').addEventListener('click', () => {
      try {
        ensureDocument();
        persist(presets().map((p) => (p.id === preset.id ? { ...p, entryIds: [...selected] } : p)));
        dialog.close();
      } catch (error) {
        showError(error);
      }
    });
    form.querySelector('[data-delete]').addEventListener('click', () =>
      confirmAction(
        tr('financial.delete_preset_f004e2', 'Delete preset?'),
        tr('ui.deleteAnalysisPreset', 'Delete “{name}”? Financial records stay unchanged.', {
          name: preset.name,
        }),
        () => {
          chosen = '';
          persist(presets().filter((p) => p.id !== preset.id));
          dialog.close();
        },
        tr('financial.delete_preset_1bc4b0', 'Delete preset'),
      ),
    );
  }
  function render() {
    ensureDocument();
    const root = $('selection-presets-content');
    if (!root) return;
    root.innerHTML = `<div class="recording-preset-toolbar"><h2>${esc(tr('financial.analysis_presets_84dc26', 'Analysis presets'))}</h2><select id="analysis-preset-select" aria-label="${esc(tr('financial.saved_analysis_preset_4bc4be', 'Saved analysis preset'))}"><option value="">${esc(tr('financial.choose_a_preset_1a9b89', 'Choose a preset'))}</option>${presets()
      .map(
        (p) =>
          `<option value="${esc(p.id)}"${p.id === chosen ? ' selected' : ''}>${esc(p.name)}</option>`,
      )
      .join(
        '',
      )}</select><button id="analysis-preset-apply" class="button button-outline" type="button"${chosen ? '' : ' disabled'}>${esc(tr('financial.apply_cfea41', 'Apply'))}</button><button id="analysis-preset-new" class="button button-outline" type="button">${esc(tr('financial.save_current_18cf72', 'Save current…'))}</button><button id="analysis-preset-manage" class="button button-quiet" type="button"${chosen ? '' : ' disabled'}>${esc(tr('financial.manage_791e88', 'Manage…'))}</button></div><p class="analysis-presets-help">${esc(tr('financial.save_checked_entry_selections_for_entry_analysis_applying__e3bc1f', 'Save checked entry selections for entry analysis. Applying a preset does not change your financial records.'))}</p>`;
    $('analysis-preset-select').addEventListener('change', (event) => {
      chosen = event.target.value;
      render();
    });
    $('analysis-preset-apply').addEventListener('click', () => {
      const preset = presets().find((p) => p.id === chosen);
      if (!preset) return;
      selected = new Set(preset.entryIds.filter((id) => known.has(id)));
      ctx.render();
    });
    $('analysis-preset-new').addEventListener('click', saveNew);
    $('analysis-preset-manage').addEventListener('click', manage);
  }
  return {
    ensureDocument,
    render,
    has: (id) => selected.has(id),
    selectedIds: () => [...selected],
    set: (id, value) => {
      value ? selected.add(id) : selected.delete(id);
    },
    setMany: (ids, value) => {
      for (const id of ids) value ? selected.add(id) : selected.delete(id);
    },
    reset: () => {
      documentId = null;
      ensureDocument();
    },
    get includedOnly() {
      return includedOnly;
    },
    set includedOnly(value) {
      includedOnly = Boolean(value);
    },
    get count() {
      return selected.size;
    },
  };
}
