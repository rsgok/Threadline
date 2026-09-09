export interface Versioned {
  version: string;
}
// Serialize writes and coalesce drafts. A failed write always retains the newest draft.
export function createSaveQueue<Draft, Saved extends Versioned>(
  initialVersion: string,
  persist: (draft: Draft, version: string) => Promise<Saved>,
  onSaved: (saved: Saved) => void,
) {
  let version = initialVersion;
  let pending: Draft | undefined;
  let running: Promise<void> | undefined;
  const flush = (): Promise<void> => {
    if (running) return running;
    if (pending === undefined) return Promise.resolve();
    running = (async () => {
      while (pending !== undefined) {
        const draft = pending;
        pending = undefined;
        try {
          const saved = await persist(draft, version);
          version = saved.version;
          onSaved(saved);
        } catch (error) {
          if (pending === undefined) pending = draft;
          throw error;
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    push(draft: Draft) {
      pending = draft;
    },
    flush,
    get dirty() {
      return pending !== undefined || running !== undefined;
    },
    get version() {
      return version;
    },
  };
}
