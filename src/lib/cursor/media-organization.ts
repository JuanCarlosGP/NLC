import { Directory } from "expo-file-system";
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

type Storage = "local" | "nas";
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

function scanLimit() {
  const deadline = Date.now() + 25000;
  let directories = 0;
  return (depth: number) => {
    if (++directories > 400 || depth > 12 || Date.now() > deadline) {
      throw new Error(tr("The video folder is too large to scan in one request.", "La carpeta de Vídeo es demasiado grande para revisarla en una sola petición."));
    }
  };
}

function isVisible(name: string) {
  return safeName(name) && !name.startsWith(".") && !ignored.has(name.toLowerCase());
}

function addAudio(audio: AudioFile[], file: AudioFile) {
  if (audio.length >= 2000) {
    throw new Error(tr("There are too many audio files to check.", "Hay demasiados archivos de audio para revisarlos."));
  }
  audio.push(file);
}

async function scanNas(settings: NasSettings, password: string, root: string) {
  const audio: AudioFile[] = [];
  const check = scanLimit();
  async function scan(path: string, relative: string, depth: number) {
    check(depth);
    for (const row of await listWebDavDir(settings, password, path)) {
      if (!isVisible(row.name)) continue;
      const child = `${path}/${row.name}`;
      if (row.path.replace(/\/+$/, "") !== child) continue;
      const filePath = relative ? `${relative}/${row.name}` : row.name;
      if (row.dir) await scan(child, filePath, depth + 1);
      else if (isAudioFile(row.name)) addAudio(audio, { name: row.name, relative: filePath, uri: child });
    }
  }
  await scan(root, "", 0);
  return audio;
}

function localName(uri: string) {
  const segment = decodeURIComponent(uri.split("/").at(-1) ?? "");
  if (!uri.startsWith("content://")) return segment;
  const document = segment.slice(segment.indexOf(":") + 1);
  return document.split("/").at(-1) ?? "";
}

async function scanLocal(root: string) {
  const audio: AudioFile[] = [];
  const check = scanLimit();
  async function scan(folder: Directory, relative: string, depth: number) {
    check(depth);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const entries = folder.list().map(entry => {
      const uri = entry.uri.replace(/\/+$/, "");
      return { entry, uri, name: localName(uri) };
    });
    if (entries.some(({ name }) => /^\.nlc-(importing|moving)-/.test(name))) {
      throw new Error(tr("Video files are being imported or moved.", "Hay una importación o un traslado de archivos en Vídeo."));
    }
    for (const { entry, uri, name } of entries) {
      if (!isVisible(name)) continue;
      const filePath = relative ? `${relative}/${name}` : name;
      if (entry instanceof Directory) await scan(entry, filePath, depth + 1);
      else if (isAudioFile(name)) addAudio(audio, { name, relative: filePath, uri });
    }
  }
  const folder = new Directory(root);
  if (!folder.exists) throw new Error("video_folder_unavailable");
  await scan(folder, "", 0);
  return audio;
}

const storageName = (storage: Storage) => storage === "nas" ? "NAS" : tr("Phone", "Teléfono");

function moveUnavailable(storage: Storage, settings: NasSettings) {
  if (storage === "local") {
    if (!usesLocal(settings, "music") || !settings.localFolderUri.trim()) {
      return tr("Choose a local folder in Music → Settings → Source to move it from the phone.",
        "Elige una carpeta local en Música → Ajustes → Fuente para trasladarlo dentro del teléfono.");
    }
    return tr("Choose separate folders for Music and Video.", "Elige carpetas distintas para Música y Vídeo.");
  }
  if (!usesNas(settings, "music") || settings.sourceKind !== "webdav" || !settings.sharePath.trim()) {
    return tr("This file is on the NAS. Moving it requires a WebDAV folder for Music on the same server.",
      "El archivo está en el NAS. Para moverlo, Música necesita una carpeta WebDAV en ese mismo servidor.");
  }
  return tr("Music and Video need separate WebDAV folders on the same server and account to move this file.",
    "Para mover este archivo, Música y Vídeo necesitan carpetas WebDAV distintas en el mismo servidor y con la misma cuenta.");
}

export async function proposeVideoToMusic(query: unknown, storage?: string, inspectOnly = false): Promise<ProposedAction | string> {
  if (query !== undefined && (typeof query !== "string" || query.length > 300)) {
    throw new Error(tr("Give me the song title or filename.", "Dime el título o el nombre del archivo."));
  }
  if (storage !== undefined && storage !== "local" && storage !== "nas") {
    throw new Error(tr("Choose Phone or NAS.", "Elige Teléfono o NAS."));
  }
  const settings = await loadNasSettings();
  const password = await loadNasPassword();
  const video = videoSourceSettings(settings);
  const nasRoot = toWebDavPath(video.sharePath);
  const localRoot = settings.videoLocalFolderUri.trim();
  const sources: { storage: Storage; scan: () => Promise<AudioFile[]> }[] = [];
  if (storage !== "local" && usesNas(settings, "video") && video.host.trim() && validRoot(nasRoot)) {
    sources.push({ storage: "nas", scan: () => scanNas(video, password, nasRoot) });
  }
  if (storage !== "nas" && Platform.OS === "android" && usesLocal(settings, "video") && localRoot) {
    sources.push({ storage: "local", scan: () => scanLocal(localRoot) });
  }
  if (!sources.length) return tr(
    "There is no Video folder to check in this source. Check Video → Settings → Source.",
    "No hay una carpeta de Vídeo disponible en esa fuente. Revisa Vídeo → Ajustes → Fuente.",
  );
  const scans = await Promise.allSettled(sources.map(source => source.scan()));
  const failures = sources.filter((_, index) => scans[index]?.status === "rejected");
  const files = scans.flatMap((result, index) =>
    result.status === "fulfilled" ? result.value.map(file => ({ ...file, storage: sources[index]!.storage })) : []);
  const match = normalize(typeof query === "string" ? query : "");
  const exact = files.filter(file => [file.name, file.relative, file.name.replace(/\.[^.]+$/, "")].some(name => normalize(name) === match));
  const candidates = exact.length ? exact : files.filter(file => normalize(file.relative).includes(match));
  const labels = candidates.slice(0, 6).map((file, index) => `${index + 1}. ${file.relative} · ${storageName(file.storage)}`).join("\n\n");
  if (failures.length) {
    const where = failures.map(source => storageName(source.storage)).join(" · ");
    const error = tr(`I couldn't finish checking Video in ${where}. Check access to that folder and try again.`,
      `No pude terminar de revisar Vídeo en ${where}. Comprueba el acceso a esa carpeta y vuelve a intentarlo.`);
    return labels ? `${error}\n\n${labels}` : error;
  }
  if (!candidates.length) return tr(
    "I found no matching audio files in Video. If the song is listed as a video, tell me the exact title shown.",
    "No encontré archivos de audio que coincidan en Vídeo. Si la canción aparece como vídeo, dime el título exacto que ves.",
  );
  if (inspectOnly) return tr(
    "I found these audio files in the folder configured for Video. Tell me which one you want to move to Music.",
    "Encontré estos archivos de audio en la carpeta configurada para Vídeo. Dime cuál quieres mover a Música.",
  ) + `\n\n${labels}`;
  if (candidates.length !== 1) return tr("Which file do you want to move?", "¿Qué archivo quieres mover?") + `\n\n${labels}`;

  const file = candidates[0]!;
  const location = storageName(file.storage);
  const music = tr("Music", "Música");
  const nas = file.storage === "nas" ? nasPair(settings) : null;
  const local = file.storage === "local" ? localPair(settings) : null;
  const localApi = local ? webNative() : null;
  const found = `${location} · ${tr("Video", "Vídeo")} / ${file.relative}`;
  if (!nas && !local) return `${found}\n\n${moveUnavailable(file.storage, settings)}`;
  if (local && !localApi?.moveAssistantAudio) {
    return `${found}\n\n${tr("Update the APK to move local audio files.", "Actualiza la APK para mover archivos de audio locales.")}`;
  }
  return {
    kind: "move",
    title: tr("Move audio to Music", "Mover audio a Música"),
    body: `${found}\n→ ${location} · ${music} / ${SONGS} / ${file.name}`,
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
