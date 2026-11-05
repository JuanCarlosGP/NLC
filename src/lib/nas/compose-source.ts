import { getDb } from "@/lib/db/client";
import { t } from "@/lib/i18n/runtime";
import { getAlbum, getAlbums, getArtists, searchCatalog } from "@/lib/db/catalog.internal";
import type { Album, AlbumDetail, Artist, MusicSource, PingResult, SearchResults } from "@/lib/nas/types";

export function composeSources(primary: MusicSource, extra: MusicSource): MusicSource {
  const merge=<T extends {id:string}>(a:T[],b:T[])=>[...new Map([...a,...b].map(item=>[item.id,item])).values()];
  async function active<T extends {id:string}>(tracks:T[]){const retired=new Set((await (await getDb()).getAllAsync<{id:string}>("SELECT id FROM service_media_retired")).map(row=>row.id));return tracks.filter(track=>!retired.has(track.id));}
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
      if(primary.kind==="opensubsonic")return merge(await primary.getArtists().catch(()=>[]),await extra.getArtists());
      await hydrate();
      return getArtists({ offlineOnly: primary.kind === "local" });
    },

    async getAlbums(): Promise<Album[]> {
      if(primary.kind==="opensubsonic")return merge(await primary.getAlbums().catch(()=>[]),await extra.getAlbums());
      await hydrate();
      return getAlbums({ offlineOnly: primary.kind === "local" });
    },

    async getAlbum(id: string): Promise<AlbumDetail> {
      if(primary.kind==="opensubsonic") {const [nas,local]=await Promise.all([primary.getAlbum(id).catch(()=>null),extra.getAlbum(id).catch(()=>null)]);const album=local||nas;if(!album)throw new Error(t("nasExtra.albumMissing"));return {...album,tracks:await active(merge(nas?.tracks||[],local?.tracks||[]))};}
      await hydrate();
      const album = await getAlbum(id, primary.kind === "local");
      if (!album) throw new Error(t("nasExtra.albumMissing"));
      return album;
    },

    async getTracks(albumId: string) {
      return (await this.getAlbum(albumId)).tracks;
    },

    async search(q: string): Promise<SearchResults> {
      if(primary.kind==="opensubsonic") {const [nas,local]=await Promise.all([primary.search(q).catch(()=>({artists:[],albums:[],tracks:[]})),extra.search(q)]);return {artists:merge(nas.artists,local.artists),albums:merge(nas.albums,local.albums),tracks:await active(merge(nas.tracks,local.tracks))};}
      await hydrate();
      return searchCatalog(q, primary.kind === "local");
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

    async refresh() {
      if (primary.refresh) await primary.refresh();
      if (extra.refresh) await extra.refresh();
    },
  };
}
