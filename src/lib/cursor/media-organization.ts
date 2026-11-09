import { Platform } from "react-native";
import { tr } from "@/lib/i18n/runtime";
import { forgetLocalVideoTree } from "@/lib/local/local-video";
import { withLocalSourceSync } from "@/lib/local/move-lock";
import { isAudioFile, isPathInside, toWebDavPath } from "@/lib/nas/webdav";
import { ensureWebDavDir, listWebDavDir, moveWebDavPath } from "@/lib/nas/webdav-source";
import { createMusicSource } from "@/lib/nas/source-factory.impl";
import { usesLocal, usesNas } from "@/lib/settings/service-source";
import { loadNasPassword, loadNasSettings, nasBaseUrl, videoSourceSettings, type NasSettings } from "@/lib/settings/storage.impl";
import { notifyCatalog } from "@/lib/db/catalog.internal";
import { assertWriteAvailable, serialize } from "@/lib/backend/native";
import { publishWebEvent, webNative } from "@/lib/backend/native-module";
import type { ProposedAction } from "./proposals";

type AudioFile = { name: string; relative: string; uri: string };
const SONGS = "Canciones";
const ignored = new Set(["@eadir", "#recycle", "#snapshot", "lost+found", "storyboards"]);
const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const safeName = (name: string) => !!name && name !== "." && name !== ".." && !/[\\/\u0000-\u001f]/.test(name);
const validRoot = (path: string) => path.startsWith("/") && path.slice(1).split("/").every(safeName);
const separate = (a: string, b: string) => validRoot(a) && validRoot(b) && !isPathInside(a, b) && !isPathInside(b, a);
const changed = () => new Error(tr("The library sources changed. Ask me to find the file again.", "Cambió la fuente de la biblioteca. Pídeme que vuelva a buscar el archivo."));

function nasPair(settings: NasSettings) {
  const video = videoSourceSettings(settings);
  const from = toWebDavPath(video.sharePath);
  const to = toWebDavPath(settings.sharePath);
  if (settings.sourceKind !== "webdav" || !usesNas(settings, "video") || !usesNas(settings, "music")
      || !settings.host.trim() || !from || !to || !separate(from, to)
      || nasBaseUrl(settings) !== nasBaseUrl(video) || settings.username.trim() !== video.username.trim()) return null;
  return { from, to, server: nasBaseUrl(settings), user: settings.username.trim() };
}

function localPair(settings: NasSettings) {
  if (Platform.OS !== "android" || !usesLocal(settings, "video") || !usesLocal(settings, "music")) return null;
  const from = settings.videoLocalFolderUri.trim();
  const to = settings.localFolderUri.trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

async function scanNas(settings: NasSettings, password: string, root: string) {
  const audio: AudioFile[] = [];
  let directories = 0;
  const deadline = Date.now() + 25000;
  async function scan(path: string, relative: string, depth: number) {
    if (++directories > 400 || depth > 12 || Date.now() > deadline) {
      throw new Error(tr("The video folder is too large to scan in one request.", "La carpeta de Vídeo es demasiado grande para revisarla en una sola petición."));
    }
    for (const row of await listWebDavDir(settings, password, path)) {
      if (!safeName(row.name) || row.name.startsWith(".") || ignored.has(row.name.toLowerCase())) continue;
      const child = `${path}/${row.name}`;
      if (row.path.replace(/\/+$/, "") !== child) continue;
      const filePath = relative ? `${relative}/${row.name}` : row.name;
      if (row.dir) await scan(child, filePath, depth + 1);
      else if (isAudioFile(row.name)) audio.push({ name: row.name, relative: filePath, uri: child });
      if (audio.length > 2000) throw new Error(tr("Too many audio files to disambiguate.", "Hay demasiados archivos de audio para elegir uno."));
    }
  }
  await scan(root, "", 0);
  return audio;
}

export async function proposeVideoToMusic(query: unknown, storage?: string): Promise<ProposedAction | string> {
  if (query !== undefined && (typeof query !== "string" || query.length > 300)) {
    throw new Error(tr("Give me the song title or filename.", "Dime el título o el nombre del archivo."));
  }
  if (storage !== undefined && storage !== "local" && storage !== "nas") {
    throw new Error(tr("Choose Phone or NAS.", "Elige Teléfono o NAS."));
  }
  const settings = await loadNasSettings();
  const password = await loadNasPassword();
  const nas = storage === "local" ? null : nasPair(settings);
  const local = storage === "nas" ? null : localPair(settings);
  const localApi = local ? webNative() : null;
  if (local && !localApi?.listAssistantAudio) {
    throw new Error(tr("Update the APK to move local audio files.", "Actualiza la APK para mover archivos de audio locales."));
  }
  if (!local && !nas) return tr(
    "Configure separate Music and Video folders on the phone or on the same WebDAV server.",
    "Configura carpetas distintas para Música y Vídeo en el teléfono o en el mismo servidor WebDAV.",
  );

  const [localFiles, nasFiles] = await Promise.all([
    local && localApi?.listAssistantAudio
      ? localApi.listAssistantAudio(local.from, local.to).then(value => JSON.parse(value) as AudioFile[])
      : Promise.resolve([]),
    nas ? scanNas(videoSourceSettings(settings), password, nas.from) : Promise.resolve([]),
  ]);
  const files = [
    ...localFiles.map(file => ({ ...file, storage: "local" as const })),
    ...nasFiles.map(file => ({ ...file, storage: "nas" as const })),
  ];
  const match = normalize(typeof query === "string" ? query : "");
  const exact = files.filter(file => [file.name, file.relative, file.name.replace(/\.[^.]+$/, "")].some(name => normalize(name) === match));
  const candidates = exact.length ? exact : files.filter(file => normalize(file.relative).includes(match));
  if (!candidates.length) return tr("I found no matching audio files in Video.", "No encontré ningún archivo de audio que coincida en Vídeo.");
  const storageName = (storage: "nas" | "local") => storage === "nas" ? "NAS" : tr("Phone", "Teléfono");
  if (candidates.length !== 1) return tr(
    "Which file do you want to move?",
    "¿Qué archivo quieres mover?",
  ) + "\n\n" + candidates.slice(0, 6).map((file, index) => `${index + 1}. ${file.relative} · ${storageName(file.storage)}`).join("\n\n");

  const file = candidates[0]!;
  const location = storageName(file.storage);
  const music = tr("Music", "Música");
  return {
    kind: "move",
    title: tr("Move audio to Music", "Mover audio a Música"),
    body: `${location} · ${tr("Video", "Vídeo")} / ${file.relative}\n→ ${location} · ${music} / ${SONGS} / ${file.name}`,
    execute: () => withLocalSourceSync(async () => {
      const { current, secret, removed } = await serialize(async () => {
        await assertWriteAvailable();
        const current = await loadNasSettings();
        const secret = await loadNasPassword();
        if (file.storage === "local") {
          if (!local || JSON.stringify(local) !== JSON.stringify(localPair(current))) throw changed();
          if (!localApi?.moveAssistantAudio) {
            throw new Error(tr("Update the APK to move local audio files.", "Actualiza la APK para mover archivos de audio locales."));
          }
          const removed = await localApi.moveAssistantAudio(local.from, local.to, file.uri, file.name);
          forgetLocalVideoTree();
          return { current, secret, removed };
        }
        if (!nas || JSON.stringify(nas) !== JSON.stringify(nasPair(current))) throw changed();
        const folder = `${nas.to}/${SONGS}`;
        await ensureWebDavDir(current, secret, folder);
        await moveWebDavPath(current, secret, file.uri, `${folder}/${file.name}`);
        return { current, secret, removed: true };
      });
      try {
        await createMusicSource(current, secret).refresh?.();
      } catch {
        notifyCatalog();
        return tr(
          `${file.name} is in Music / ${SONGS}. Refresh the library to see it.${removed ? "" : " The original remains in Video."}`,
          `${file.name} está en Música / ${SONGS}. Actualiza la biblioteca para verlo.${removed ? "" : " El original sigue en Vídeo."}`,
        );
      } finally {
        publishWebEvent({ type: "change", domain: "video" });
      }
      return removed
        ? tr(`Moved ${file.name} to Music / ${SONGS}.`, `Moví ${file.name} a Música / ${SONGS}.`)
        : tr(`Copied ${file.name} to Music / ${SONGS}. The original remains in Video.`, `Copié ${file.name} a Música / ${SONGS}. El original sigue en Vídeo.`);
    }),
  };
}
