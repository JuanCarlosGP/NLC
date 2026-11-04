import type { CatalogDb } from "../../db/types";
import { validateRest, validateSession, type RestTimer, type TrainingSession } from "./model";

export type TrainingStore = {
  list(): Promise<TrainingSession[]>; save(session: TrainingSession): Promise<void>; remove(id: string): Promise<void>;
  getRest(): Promise<RestTimer | null>; setRest(timer: RestTimer | null): Promise<void>;
};
export function createTrainingStore(open: () => Promise<CatalogDb>): TrainingStore {
  return {
    async list() {
      const db = await open();
      const rows = await db.getAllAsync<{ payload: string }>("SELECT payload FROM health_training_sessions ORDER BY session_date DESC, updated_at DESC");
      return rows.map((row) => validateSession(JSON.parse(row.payload)));
    },
    async save(session) {
      validateSession(session);
      const db = await open();
      // The complete session is one atomic SQLite statement, including its ordered exercises and sets.
      await db.runAsync(`INSERT INTO health_training_sessions (id, session_date, updated_at, payload) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET session_date = excluded.session_date, updated_at = excluded.updated_at, payload = excluded.payload`,
      session.id, session.date, session.updatedAt, JSON.stringify(session));
    },
    async remove(id) { const db = await open(); await db.runAsync("DELETE FROM health_training_sessions WHERE id = ?", id); },
    async getRest() {
      const db = await open();
      const row = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM health_training_rest WHERE id = 1");
      return row ? validateRest(JSON.parse(row.payload)) : null;
    },
    async setRest(timer) {
      const db = await open();
      if (!timer) { await db.runAsync("DELETE FROM health_training_rest WHERE id = 1"); return; }
      validateRest(timer);
      await db.runAsync("INSERT OR REPLACE INTO health_training_rest (id, payload) VALUES (1, ?)", JSON.stringify(timer));
    },
  };
}
