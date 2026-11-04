import { BodyPhotoError, BODY_POSES, bodyId, normalizeBodyInput, sortBodyReviews, validateBodyReview, validatePhoto, type BodyPhoto, type BodyPose, type BodyReview, type PhotoImport } from "./model";
import { localDateKey } from "../weight/model";

export type PhotoSource = { uri: string; dispose(): void };
export type BodyPersistence = {
  list(): Promise<BodyReview[]>;
  put(entry: BodyReview, imports: { photo: BodyPhoto; input: PhotoImport }[]): Promise<void>;
  remove(entry: BodyReview): Promise<void>;
  removePhotos(photos: BodyPhoto[]): Promise<void>;
  source(photo: BodyPhoto): Promise<PhotoSource>;
};
export function createBodyStore(persistence: BodyPersistence, now = () => Date.now()) {
  let pending: Promise<unknown> = Promise.resolve();
  function write(task: () => Promise<BodyReview[]>) { const next = pending.then(task); pending = next.catch(() => {}); return next; }
  async function read() {
    const entries = (await persistence.list()).map(validateBodyReview);
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length || new Set(entries.map((entry) => entry.date)).size !== entries.length) throw new BodyPhotoError("invalid");
    const photos = entries.flatMap((entry) => Object.values(entry.photos));
    if (new Set(photos.map((photo) => photo.id)).size !== photos.length) throw new BodyPhotoError("invalid");
    return sortBodyReviews(entries);
  }
  function required(entries: BodyReview[], id: string) { const found = entries.find((entry) => entry.id === id); if (!found) throw new BodyPhotoError("missing"); return found; }
  return {
    async list() { await pending; return read(); },
    save(date: string, note: string, id?: string) {
      return write(async () => {
        const normalized = normalizeBodyInput(date, note, localDateKey(new Date(now()))); const entries = await read();
        const existing = id ? required(entries, id) : null;
        if (entries.some((entry) => entry.date === normalized.date && entry.id !== id)) throw new BodyPhotoError("conflict");
        const timestamp = now(); const next = validateBodyReview({ id: existing?.id ?? bodyId(), ...normalized, photos: existing?.photos ?? {}, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp });
        await persistence.put(next, []); return sortBodyReviews([...entries.filter((entry) => entry.id !== next.id), next]);
      });
    },
    setPhoto(id: string, pose: BodyPose, input: PhotoImport | null) {
      return write(async () => {
        if (!BODY_POSES.includes(pose)) throw new BodyPhotoError("invalid");
        if (input) validatePhoto(input);
        const entries = await read(); const entry = required(entries, id); const previous = entry.photos[pose];
        const photos = { ...entry.photos }; const photo: BodyPhoto | null = input ? { id: bodyId(), mime: input.mime, bytes: input.bytes, width: input.width, height: input.height } : null;
        if (photo) photos[pose] = photo; else delete photos[pose];
        const next = validateBodyReview({ ...entry, photos, updatedAt: now() });
        await persistence.put(next, photo && input ? [{ photo, input }] : []);
        if (previous) await persistence.removePhotos([previous]).catch(() => {});
        return sortBodyReviews([...entries.filter((row) => row.id !== id), next]);
      });
    },
    remove(id: string) {
      return write(async () => {
        const entries = await read(); const entry = required(entries, id);
        await persistence.remove(entry);
        await persistence.removePhotos(Object.values(entry.photos)).catch(() => {});
        return entries.filter((row) => row.id !== id);
      });
    },
    source: persistence.source,
  };
}
export type BodyStore = ReturnType<typeof createBodyStore>;
