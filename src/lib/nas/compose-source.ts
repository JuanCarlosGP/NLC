import { getAlbum, getAlbums, getArtists, searchCatalog } from "@/lib/db/catalog";
import type { Album, AlbumDetail, Artist, MusicSource, PingResult, SearchResults } from "@/lib/nas/types";

export function composeSources(primary: MusicSource, extra: MusicSource): MusicSource {
  async function hydrate() {
    try {
      await primary.getAlbums();
    } catch {
      // NAS down — local still usable.
    }
    await extra.getAlbums();
  }

  return {
    kind: primary.kind,

    async ping(): Promise<PingResult> {
      const [nas, local] = await Promise.all([primary.ping(), extra.ping()]);
      if (nas.ok || local.ok) {
        return {
          ok: true,
          message: [nas.ok ? nas.message : null, local.ok ? local.message : null].filter(Boolean).join(" "),
          serverName: nas.ok ? nas.serverName : local.serverName,
        };
      }
      return nas;
    },

    async getArtists(): Promise<Artist[]> {
      await hydrate();
      return getArtists();
    },

    async getAlbums(): Promise<Album[]> {
      await hydrate();
      return getAlbums();
    },

    async getAlbum(id: string): Promise<AlbumDetail> {
      await hydrate();
      const album = await getAlbum(id);
      if (!album) throw new Error("Álbum no encontrado.");
      return album;
    },

    async getTracks(albumId: string) {
      return (await this.getAlbum(albumId)).tracks;
    },

    async search(q: string): Promise<SearchResults> {
      await hydrate();
      return searchCatalog(q);
    },

    async streamUrl(trackId: string) {
      if (trackId.startsWith("local")) return extra.streamUrl(trackId);
      return primary.streamUrl(trackId);
    },

    async coverUrl(id: string, size?: number) {
      if (id.startsWith("local") || id.startsWith("content:") || id.startsWith("file:")) {
        return extra.coverUrl(id, size);
      }
      return primary.coverUrl(id, size);
    },

    async deleteTrack(trackId: string) {
      if (trackId.startsWith("local")) {
        await extra.deleteTrack?.(trackId);
        return;
      }
      await primary.deleteTrack?.(trackId);
    },

    async ensureCoverSidecar(trackId: string, imageUrl: string) {
      if (trackId.startsWith("local")) return null;
      return primary.ensureCoverSidecar?.(trackId, imageUrl) ?? null;
    },
  };
}
