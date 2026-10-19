// Open/closed state of the "Delete profile" dialog (KAN-56). It lives outside
// React and outside the routes on purpose: deleting signs the person out, which
// unmounts every signed-in page, and the dialog still has to show "deleted".

export interface DeleteProfileDialogState {
  open: boolean;
  /** Whose profile, kept from when it opened (the session ends on delete). */
  name: string;
  /** Where a backup made just before was saved, if one was. */
  backupPath: string | null;
}

let state: DeleteProfileDialogState = {
  open: false,
  name: "",
  backupPath: null,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const deleteProfileDialog = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  open(name: string, backupPath: string | null = null) {
    state = { open: true, name, backupPath };
    emit();
  },
  close() {
    state = { ...state, open: false };
    emit();
  },
};
