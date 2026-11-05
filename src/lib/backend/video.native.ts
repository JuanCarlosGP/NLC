import { expose } from "./registry";
import { getDb } from "@/lib/db/client";
import { BackendError } from "./protocol";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { createVideoClient } from "@/lib/video/source";
import { listVideoShows, videoSeriesRoot, videoMoviesRoot, videoShareRoot } from "@/lib/video/catalog";
import { LOCAL_VIDEO_ROOT } from "@/lib/local/local-video";
async function remember(path: string, directory: boolean) { await (await getDb()).runAsync("INSERT INTO backend_resources(kind, id, directory) VALUES ('video', ?, ?) ON CONFLICT(kind,id) DO UPDATE SET directory=excluded.directory", path.replace(/\/+$/, ""), directory ? 1 : 0); }
export async function knownVideo(path: string) { return (await getDb()).getFirstAsync<{ id: string; directory: number }>("SELECT id, directory FROM backend_resources WHERE kind='video' AND id=?", path.replace(/\/+$/, "")); }
expose("video.shows", async () => { const settings = await loadNasSettings(); const shows = await listVideoShows(settings, await loadNasPassword()); for (const show of shows) await remember(show.path, !show.file); return shows; }, { domain: "video", atomic: false });
expose("video.list", async (path: string) => {
 const settings = await loadNasSettings(); const normalized = path.replace(/\/+$/, "");
 const roots = [LOCAL_VIDEO_ROOT, videoShareRoot(settings), videoSeriesRoot(settings), videoMoviesRoot(settings)];
 if (!roots.includes(normalized) && !(await knownVideo(normalized))?.directory) throw new BackendError(404, "unknown_video_folder");
 if (normalized.split("/").some(part => part === ".." || part === ".")) throw new BackendError(400, "invalid_video");
 const entries = await createVideoClient(settings, await loadNasPassword()).listDir(path);
 for (const entry of entries) await remember(entry.path, entry.dir); return entries;
}, { domain: "video", atomic: false });
export async function videoMedia(id: string) {
 const row = await knownVideo(id); if (!row || row.directory) throw new BackendError(404, "unknown_video");
 const source = await createVideoClient(await loadNasSettings(), await loadNasPassword()).playable(row.id);
 return typeof source === "string" ? { uri: source } : source;
}

export async function discoverTuiVideo(path:string) {
 const settings=await loadNasSettings(), roots=[LOCAL_VIDEO_ROOT,videoShareRoot(settings),videoSeriesRoot(settings),videoMoviesRoot(settings)].filter(Boolean);
 if(path.split("/").some(part=>part===".."||part===".") || !roots.some(root=>path.startsWith(root.replace(/\/+$/,"")+"/")))throw new BackendError(404,"unknown_video");
 const entries=await createVideoClient(settings,await loadNasPassword()).listDir(path.slice(0,path.lastIndexOf("/")));
 if(!entries.some(entry=>entry.path===path&&!entry.dir))throw new BackendError(404,"unknown_video");await remember(path,false);
}
