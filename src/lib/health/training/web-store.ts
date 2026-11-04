import { validateSession, validateRest, type TrainingSession, type RestTimer } from "./model";
import type { TrainingStore } from "./store";
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export const TRAINING_WEB_KEY = "nlc.health.training.v1";
export function createWebTrainingStore(storage: Storage): TrainingStore {
  let pending: Promise<unknown> = Promise.resolve();
  function write(task: () => Promise<void>) {
    const next = pending.then(task); pending = next.catch(() => {}); return next;
  }
  async function read(): Promise<{ sessions: TrainingSession[]; rest: RestTimer | null }> {
    const raw = await storage.getItem(TRAINING_WEB_KEY);
    if (raw === null) return { sessions: [], rest: null };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.sessions)) throw new Error("Invalid training storage");
    return { sessions: data.sessions.map(validateSession), rest: data.rest ? validateRest(data.rest) : null };
  }
  return {
    async list() { await pending; return (await read()).sessions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt); },
    save(session) { return write(async () => { validateSession(session); const data = await read(); data.sessions = [...data.sessions.filter((row) => row.id !== session.id), session]; await storage.setItem(TRAINING_WEB_KEY, JSON.stringify(data)); }); },
    remove(id) { return write(async () => { const data = await read(); data.sessions = data.sessions.filter((row) => row.id !== id); await storage.setItem(TRAINING_WEB_KEY, JSON.stringify(data)); }); },
    async getRest() { await pending; return (await read()).rest; },
    setRest(timer) { return write(async () => { if (timer) validateRest(timer); const data = await read(); data.rest = timer; await storage.setItem(TRAINING_WEB_KEY, JSON.stringify(data)); }); },
  };
}
