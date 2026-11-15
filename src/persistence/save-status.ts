import { create } from 'zustand';

/**
 * Save status lives in its OWN small store, separate from the game store.
 *
 * Why: the game store is persisted, and Zustand's persist writes on every
 * change. If "last saved at" lived there, recording a save would change
 * the state, which triggers another save, which records a save… forever.
 */
export type SaveStatus = {
  /** Epoch ms of the last successful write, or null if nothing saved this session. */
  lastSavedAt: number | null;
  /** Shown to the user, e.g. why a save couldn't be loaded. */
  notice: string | null;
  /** True once a save was found and loaded at startup. */
  loadedFromSave: boolean;
};

export const useSaveStatus = create<SaveStatus>()(() => ({ lastSavedAt: null, notice: null, loadedFromSave: false }));

export const saveStatus = {
  wrote: () => useSaveStatus.setState({ lastSavedAt: Date.now() }),
  failed: (error: unknown) =>
    useSaveStatus.setState({ notice: `Your progress couldn't be saved (${error instanceof Error ? error.message : String(error)}).` }),
  loaded: () => useSaveStatus.setState({ loadedFromSave: true }),
  notify: (notice: string) => useSaveStatus.setState({ notice }),
  dismissNotice: () => useSaveStatus.setState({ notice: null }),
};
