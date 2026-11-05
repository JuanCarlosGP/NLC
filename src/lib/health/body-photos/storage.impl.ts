import { coordinatedHealthStore } from "../access";
import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "@/lib/db/client";
import { BodyPhotoError, photoExtension, validBodyId, type BodyPhoto } from "./model";
import { createBodyStore } from "./store";
import { createFileBodyPersistence } from "./file-persistence";
function photoUri(photo: BodyPhoto): string {
  if (!FileSystem.documentDirectory || !validBodyId(photo.id)) throw new BodyPhotoError("invalid");
  return `${FileSystem.documentDirectory}health-body-photos/${photo.id}.${photoExtension(photo.mime)}`;
}
export const bodyStore = coordinatedHealthStore(createBodyStore(createFileBodyPersistence(getDb, {
  async copy(photo, input) {
    if (typeof input.source !== "string" || !input.source.startsWith("file://")) throw new BodyPhotoError("invalid");
    const uri = photoUri(photo);
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}health-body-photos/`, { intermediates: true });
    await FileSystem.copyAsync({ from: input.source, to: uri });
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size !== photo.bytes) throw new BodyPhotoError("size");
  },
  async remove(photo) { await FileSystem.deleteAsync(photoUri(photo), { idempotent: true }); },
  async source(photo) {
    const uri = photoUri(photo); const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) throw new BodyPhotoError("missing");
    return { uri, dispose() {} };
  },
})));
