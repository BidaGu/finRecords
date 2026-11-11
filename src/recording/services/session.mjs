function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export function createSession(
  initial,
  { validate, execute, onListenerError = (error) => console.error(error) } = {},
) {
  if (typeof validate !== 'function' || typeof execute !== 'function')
    throw new Error('The session requires coordinated validation and editing functions.');
  let document = validate(initial),
    dirty = false,
    busy = false,
    fileName = 'Untitled',
    handle = null;
  let stateMessage = 'Not saved';
  const listeners = new Set();
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        try {
          onListenerError(error);
        } catch {}
      }
    }
  };
  const snapshot = () => freeze(structuredClone(document));
  return {
    snapshot,
    getStatus: () => ({ dirty, busy, fileName, handle, message: stateMessage }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    command(command) {
      if (busy) throw new Error('Wait for the current file operation.');
      const next = execute(document, command);
      if (JSON.stringify(next) !== JSON.stringify(document)) {
        document = next;
        dirty = true;
        stateMessage = 'Unsaved changes';
        emit();
      }
      return snapshot();
    },
    replace(candidate, options = {}) {
      const next = validate(candidate);
      document = next;
      fileName = options.fileName ?? 'Untitled';
      handle = options.handle ?? null;
      dirty = Boolean(options.dirty);
      stateMessage = options.message ?? (dirty ? 'Unsaved changes' : 'File opened');
      emit();
      return snapshot();
    },
    updateSettings(settings) {
      if (busy) throw new Error('Wait for the current file operation.');
      const next = validate({ ...document, settings: structuredClone(settings) });
      if (JSON.stringify(next.settings) !== JSON.stringify(document.settings)) {
        document = next;
        dirty = true;
        stateMessage = 'Unsaved settings';
        emit();
      }
      return snapshot();
    },
    setBusy(value) {
      busy = Boolean(value);
      emit();
    },
    markSaved(options = {}) {
      const { name, fileHandle, downloaded = false, savedDocument } = options;
      if (name) fileName = name;
      if (fileHandle) handle = fileHandle;
      if (downloaded) stateMessage = 'Copy downloaded';
      else if (!savedDocument || JSON.stringify(savedDocument) === JSON.stringify(document)) {
        dirty = false;
        stateMessage = 'Saved';
      }
      emit();
    },
  };
}
