import type { CatalogDb } from "../../db/types";
import { validateBodyReview, type BodyPhoto, type PhotoImport } from "./model";
import type { BodyPersistence, PhotoSource } from "./store";
export type BodyFiles = { copy(photo: BodyPhoto, input: PhotoImport): Promise<void>; remove(photo: BodyPhoto): Promise<void>; source(photo: BodyPhoto): Promise<PhotoSource> };
export function createFileBodyPersistence(open: () => Promise<CatalogDb>, files: BodyFiles): BodyPersistence {
  return {
    async list() { const db = await open(); const rows = await db.getAllAsync<{ payload: string }>("SELECT payload FROM health_body_reviews ORDER BY entry_date DESC"); return rows.map((row) => validateBodyReview(JSON.parse(row.payload))); },
    async put(entry, imports) {
      try {
        // Private copies become referenced only after the atomic metadata write succeeds.
        for (const item of imports) await files.copy(item.photo, item.input);
        const db = await open(); await db.runAsync(`INSERT INTO health_body_reviews (id, entry_date, payload) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET entry_date = excluded.entry_date, payload = excluded.payload`, entry.id, entry.date, JSON.stringify(entry));
      } catch (error) {
        await Promise.all(imports.map((item) => files.remove(item.photo).catch(() => {}))); throw error;
      }
    },
    async remove(entry) { const db = await open(); await db.runAsync("DELETE FROM health_body_reviews WHERE id = ?", entry.id); },
    async removePhotos(photos) { await Promise.all(photos.map((photo) => files.remove(photo))); },
    source: files.source,
  };
}
