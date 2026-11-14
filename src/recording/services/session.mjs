import { ValidationError } from '../core/values.mjs';
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
    throw new ValidationError(
      'The session requires coordinated validation and editing functions.',
      {
        code: 'errors.services.session.the-session-requires-coordinated-validation-and-editing-functions',
      },
    );
  let document = validate(initial),
    dirty = false,
    busy = false,
    fileName = 'Untitled',
    isUntitled = true,
    handle = null;
  let stateMessage = 'Not saved';
  let messageCode = 'session.notSaved',
    messageParams = {};
  const statusMessage = (message, code, params = {}) => {
    stateMessage = message;
    messageCode = code;
    messageParams = { ...params };
  };
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
    getStatus: () => ({
      dirty,
      busy,
      fileName,
      isUntitled,
      handle,
      message: stateMessage,
      messageCode,
      messageParams: { ...messageParams },
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    command(command) {
      if (busy)
        throw new ValidationError('Wait for the current file operation.', {
          code: 'errors.services.session.wait-for-the-current-file-operation',
        });
      const next = execute(document, command);
      if (JSON.stringify(next) !== JSON.stringify(document)) {
        document = next;
        dirty = true;
        statusMessage('Unsaved changes', 'session.unsavedChanges');
        emit();
      }
      return snapshot();
    },
    replace(candidate, options = {}) {
      const next = validate(candidate);
      document = next;
      fileName = options.fileName ?? 'Untitled';
      isUntitled = options.fileName === undefined || options.fileName === null;
      handle = options.handle ?? null;
      dirty = Boolean(options.dirty);
      statusMessage(
        options.message ?? (dirty ? 'Unsaved changes' : 'File opened'),
        options.messageCode ??
          (options.message === undefined
            ? dirty
              ? 'session.unsavedChanges'
              : 'session.opened'
            : null),
        options.messageParams,
      );
      emit();
      return snapshot();
    },
    updateSettings(settings) {
      if (busy)
        throw new ValidationError('Wait for the current file operation.', {
          code: 'errors.services.session.wait-for-the-current-file-operation',
        });
      const next = validate({ ...document, settings: structuredClone(settings) });
      if (JSON.stringify(next.settings) !== JSON.stringify(document.settings)) {
        document = next;
        dirty = true;
        statusMessage('Unsaved settings', 'session.unsavedSettings');
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
      if (name) {
        fileName = name;
        isUntitled = false;
      }
      if (fileHandle) handle = fileHandle;
      if (downloaded) statusMessage('Copy downloaded', 'session.copyDownloaded');
      else if (!savedDocument || JSON.stringify(savedDocument) === JSON.stringify(document)) {
        dirty = false;
        statusMessage('Saved', 'session.saved');
      }
      emit();
    },
  };
}
