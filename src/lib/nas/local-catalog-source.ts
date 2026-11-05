import {
  getAlbum,
  getAlbums,
  getArtists,
  getLocalUri,
  searchCatalog,
} from "@/lib/db/catalog.internal";
import type { MusicSource } from "./types";
// An empty local installation stays empty. Restored files remain playable offline.
export const localCatalogSource: MusicSource = {
  kind: "local",
  ping: async () => ({ ok: true, message: "", serverName: "NLC" }),
  getArtists: () => getArtists({ offlineOnly: true }),
  getAlbums: () => getAlbums({ offlineOnly: true }),
  async getAlbum(id) {
    const album = await getAlbum(id, true);
    if (!album) throw new Error("albumMissing");
    return album;
  },
  async getTracks(id) {
    return (await this.getAlbum(id)).tracks;
  },
  search: (q) => searchCatalog(q, true),
  async streamUrl(id) {
    const uri = await getLocalUri(id);
    if (!uri) throw new Error("localFileMissing");
    return { uri };
  },
  coverUrl: async (id) => (/^(content:|file:|https?:)/.test(id) ? id : null),
};
