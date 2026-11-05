import { knownTrack, knownArtwork } from "./known-media.native";
import { getDb } from "@/lib/db/client";
import { md5Hex } from "@/lib/crypto/md5";
import { decodeMediaId } from "./media-id";
import { videoMedia } from "./video.native";
import { createMusicSource } from "@/lib/nas/source-factory.impl";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { getTracks, getLocalUri } from "@/lib/db/catalog.impl";
import { bodyStore } from "@/lib/health/body-photos/storage.impl";
import { BackendError } from "./protocol";
export async function resolveMedia(path: string) {
 const parts = path.split("/"); if (parts.length !== 6) throw new BackendError(400, "invalid_media");
 const kind = parts[4], id = decodeMediaId(parts[5]);
 if (kind === "video") return { ...await videoMedia(id), mime: /\.webm$/i.test(id) ? "video/webm" : "video/mp4" };
 if (kind === "photo") {
  const photo = (await bodyStore.list()).flatMap(review => Object.values(review.photos)).find(photo => photo.id === id);
  if (!photo) throw new BackendError(404, "unknown_photo");
  const result = await bodyStore.source(photo); return { uri: result.uri, mime: photo.mime };
 }
 if (kind === "artwork") { const uri = [...await knownArtwork()].find(uri => md5Hex(uri) === id); if(!uri)throw new BackendError(404,"unknown_artwork"); return {uri,mime:/\.png(?:$|\?)/i.test(uri)?"image/png":/\.webp(?:$|\?)/i.test(uri)?"image/webp":"image/jpeg"}; }
 const settings = await loadNasSettings(); const source = createMusicSource(settings, await loadNasPassword());
 if (kind === "track") {
  const track = await knownTrack(id);
  const local = await getLocalUri(id); if (!local && /^(local:|localpod:|file:|content:)/.test(id)) throw new BackendError(404,"unknown_local_file"); const playable = local || await source.streamUrl(id); return { ...(typeof playable === "string" ? { uri: playable } : playable), mime: track.contentType || "application/octet-stream" };
 }
 if (kind === "cover") {
  // Only a cover belonging to the catalogue can be resolved. A client cannot supply a file/URL.
  const track = (await getTracks()).find(track => track.coverId === id || track.id === id);
  if (!track && !(await knownArtwork()).has(id) && !await (await getDb()).getFirstAsync("SELECT id FROM backend_resources WHERE kind='cover' AND id=?",id)) throw new BackendError(404, "unknown_cover");
  const uri = await source.coverUrl(track?.coverId || id); if (!uri) throw new BackendError(404, "unknown_cover");
  return { uri, mime: "image/jpeg" };
 }
 throw new BackendError(404, "unknown_media");
}
