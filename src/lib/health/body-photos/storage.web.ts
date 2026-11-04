import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { idbDone as done, idbResult as result } from "../web-database";
import { BodyPhotoError, detectPhotoMime, validateBodyReview, type BodyPhoto } from "./model";
import { createBodyStore, type BodyPersistence } from "./store";
export { BODY_WEB_DB } from "../web-storage";
const database = healthWeb.open;
const persistence: BodyPersistence = {
  async list() { const db = await database(); const rows = await result(db.transaction("reviews", "readonly").objectStore("reviews").getAll()); return rows.map(validateBodyReview); },
  async put(entry, imports) {
    for (const { photo, input } of imports) {
      if (!(input.source instanceof Blob) || input.source.size !== photo.bytes) throw new BodyPhotoError("invalid");
      if (detectPhotoMime(new Uint8Array(await input.source.slice(0, 16).arrayBuffer())) !== photo.mime) throw new BodyPhotoError("type");
    }
    const db = await database(); const tx = db.transaction(["reviews", "photos"], "readwrite"); const completed = done(tx);
    for (const { photo, input } of imports) tx.objectStore("photos").put({ id: photo.id, blob: input.source });
    tx.objectStore("reviews").put(entry); await completed;
  },
  async remove(entry) {
    const db = await database(); const tx = db.transaction(["reviews", "photos"], "readwrite"); const completed = done(tx);
    tx.objectStore("reviews").delete(entry.id);
    for (const photo of Object.values(entry.photos)) tx.objectStore("photos").delete(photo.id);
    await completed;
  },
  async removePhotos(photos: BodyPhoto[]) {
    const db = await database(); const tx = db.transaction("photos", "readwrite"); const completed = done(tx);
    for (const photo of photos) tx.objectStore("photos").delete(photo.id); await completed;
  },
  async source(photo) {
    const db = await database(); const row = await result(db.transaction("photos", "readonly").objectStore("photos").get(photo.id));
    if (!(row?.blob instanceof Blob)) throw new BodyPhotoError("missing");
    const uri = URL.createObjectURL(row.blob); return { uri, dispose() { URL.revokeObjectURL(uri); } };
  },
};
export const bodyStore = coordinatedHealthStore(createBodyStore(persistence));
