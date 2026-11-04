import type { TrainingSession } from "./model";

// Newer edits replace queued snapshots. Failed writes remain retryable in memory.
export function createSessionSaveQueue(save: (session: TrainingSession) => Promise<void>) {
  const pending = new Map<string, TrainingSession>();
  let running: Promise<void> | null = null;
  function flush(): Promise<void> {
    if (running) return running;
    running = (async () => {
      while (pending.size) {
        const [id, snapshot] = pending.entries().next().value!;
        await save(snapshot);
        if (pending.get(id) === snapshot) pending.delete(id);
      }
    })().finally(() => { running = null; });
    return running;
  }
  return { put(session: TrainingSession) { pending.set(session.id, session); }, flush, get dirty() { return pending.size > 0; } };
}
