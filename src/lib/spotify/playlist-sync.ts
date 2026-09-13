import { t } from "@/lib/i18n/runtime";
import { joinPath } from "@/lib/nas/webdav";
import { getWebDavText, putWebDavText } from "@/lib/nas/webdav-source";
import type { NasSettings } from "@/lib/settings/storage";
import { getPlaylistsUpdatedAt, loadPlaylists, savePlaylists, setPlaylistsUpdatedAt } from "@/lib/db/catalog";
import {
  PLAYLISTS_FILE,
  dumpItemToPlaylist,
  parsePlaylistDump,
  playlistToDumpItem,
  readLocalPlaylistsFile,
  writeLocalPlaylistsFile,
  type PlaylistDump,
} from "@/lib/spotify/playlist-file";
import { emitPlaylistStoreChanged } from "@/lib/spotify/playlist-store";

function playlistsDavPath(settings: NasSettings): string {
  return joinPath(settings.sharePath, PLAYLISTS_FILE);
}

function canWriteNas(settings: NasSettings, password: string): boolean {
  return (
    settings.sourceKind === "webdav" &&
    Boolean(password.trim()) &&
    Boolean(settings.host.trim()) &&
    Boolean(settings.sharePath.trim())
  );
}

async function dumpPlaylists(): Promise<PlaylistDump> {
  const playlists = await loadPlaylists();
  const storedAt = await getPlaylistsUpdatedAt();
  const importedAt = playlists.reduce((max, item) => Math.max(max, item.importedAt || 0), 0);
  return {
    version: 1,
    updatedAt: Math.max(storedAt, importedAt),
    playlists: playlists.map(playlistToDumpItem),
  };
}

async function replacePlaylists(dump: PlaylistDump): Promise<void> {
  await savePlaylists(dump.playlists.map(dumpItemToPlaylist), { updatedAt: dump.updatedAt });
  emitPlaylistStoreChanged();
}

async function readNasPlaylists(settings: NasSettings, password: string): Promise<PlaylistDump | null> {
  if (!canWriteNas(settings, password)) return null;
  try {
    const raw = await getWebDavText(settings, password, playlistsDavPath(settings));
    return parsePlaylistDump(raw);
  } catch {
    return null;
  }
}

async function writeNasPlaylists(settings: NasSettings, password: string, dump: PlaylistDump): Promise<void> {
  if (!canWriteNas(settings, password)) return;
  await putWebDavText(
    settings,
    password,
    playlistsDavPath(settings),
    `${JSON.stringify(dump, null, 2)}\n`,
  );
}

function pickNewer(a: PlaylistDump | null, b: PlaylistDump | null): PlaylistDump | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

export async function pullPlaylistsFromSources(settings: NasSettings, password: string): Promise<boolean> {
  const local = await dumpPlaylists();
  const remoteNas = await readNasPlaylists(settings, password);
  const remoteFolder = settings.localFolderUri
    ? await readLocalPlaylistsFile(settings.localFolderUri)
    : null;
  const incoming = pickNewer(remoteNas, remoteFolder);
  if (!incoming) return false;
  if (local.playlists.length > 0 && incoming.updatedAt <= local.updatedAt) return false;
  await replacePlaylists(incoming);
  return true;
}

export async function pushPlaylistsToSources(settings: NasSettings, password: string): Promise<string | null> {
  const dump = { ...(await dumpPlaylists()), updatedAt: Date.now() };
  const writes: Promise<void>[] = [];
  if (settings.localFolderUri) {
    writes.push(writeLocalPlaylistsFile(settings.localFolderUri, dump));
  }
  if (canWriteNas(settings, password)) {
    writes.push(writeNasPlaylists(settings, password, dump));
  }
  if (!writes.length) return null;
  const results = await Promise.allSettled(writes);
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      const reason = result.reason;
      console.warn("No se pudieron copiar las playlists", reason);
      errors.push(reason instanceof Error ? reason.message : t("feedback.writePlaylistsFail"));
    }
  }
  if (!errors.length) {
    await setPlaylistsUpdatedAt(dump.updatedAt);
  }
  return errors[0] ?? null;
}
