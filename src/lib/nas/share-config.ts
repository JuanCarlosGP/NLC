import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HOME_BROWSE_KEY,
  LIBRARY_BROWSE_KEY,
  LIBRARY_TAB_KEY,
  parseBrowsePrefs,
  type BrowsePrefs,
} from "@/hooks/use-browse-prefs";
import { parseLibraryTab, type LibraryTab } from "@/hooks/use-library";
import { loadFavorites, loadRecents } from "@/lib/library/cache";
import { joinPath, normalizeSharePath } from "@/lib/nas/webdav";
import { putWebDavText } from "@/lib/nas/webdav-source";
import type { NasSettings } from "@/lib/settings/storage";
import { loadImportedPlaylists } from "@/lib/spotify/playlist-store";

export const SND_CONFIG_FILENAME = "snd.json";

export type SndShareBrowse = {
  home: BrowsePrefs;
  library: BrowsePrefs & { tab: LibraryTab };
};

export type SndShareConfig = {
  version: 1;
  savedAt: number;
  connection: {
    sourceKind: NasSettings["sourceKind"];
    host: string;
    port: string;
    username: string;
    sharePath: string;
    useHttps: boolean;
    maxBitRate: string;
  };
  favorites: Awaited<ReturnType<typeof loadFavorites>>;
  recents: Awaited<ReturnType<typeof loadRecents>>;
  playlists: Awaited<ReturnType<typeof loadImportedPlaylists>>;
  browse: SndShareBrowse;
};

export async function collectShareConfig(settings: NasSettings): Promise<SndShareConfig> {
  const [favorites, recents, playlists, homeRaw, libraryRaw, tabRaw] = await Promise.all([
    loadFavorites(settings.sourceKind),
    loadRecents(settings.sourceKind),
    loadImportedPlaylists(),
    AsyncStorage.getItem(HOME_BROWSE_KEY),
    AsyncStorage.getItem(LIBRARY_BROWSE_KEY),
    AsyncStorage.getItem(LIBRARY_TAB_KEY),
  ]);
  return {
    version: 1,
    savedAt: Date.now(),
    connection: {
      sourceKind: settings.sourceKind,
      host: settings.host,
      port: settings.port,
      username: settings.username,
      sharePath: settings.sharePath,
      useHttps: settings.useHttps,
      maxBitRate: settings.maxBitRate,
    },
    favorites,
    recents,
    playlists,
    browse: {
      home: parseBrowsePrefs(homeRaw),
      library: {
        ...parseBrowsePrefs(libraryRaw),
        tab: parseLibraryTab(tabRaw),
      },
    },
  };
}

export function shareConfigPath(settings: NasSettings): string {
  const root = normalizeSharePath(settings.sharePath || "/Music");
  return joinPath(root, SND_CONFIG_FILENAME);
}

export async function writeShareConfig(settings: NasSettings, password: string): Promise<string> {
  const path = shareConfigPath(settings);
  const config = await collectShareConfig(settings);
  await putWebDavText(settings, password, path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}
