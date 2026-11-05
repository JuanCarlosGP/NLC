import * as offline from "@/lib/offline/downloader.impl";
import { expose } from "./registry";
import { publishWebEvent } from "./native-module";
import { createMusicSource } from "@/lib/nas/source-factory.impl";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { getTracks } from "@/lib/db/catalog.impl";
import { BackendError } from "./protocol";
offline.setOfflineResolver(async id => createMusicSource(await loadNasSettings(), await loadNasPassword()).streamUrl(id));
let last = 0; let previous = "";
offline.subscribeOfflineProgress(() => { const next = JSON.stringify(offline.getOfflineProgress()); if (next === previous) return; previous = next; if (Date.now() - last > 200 || !offline.getOfflineProgress().running) { last = Date.now(); publishWebEvent({ type: "change", domain: "offline" }); } });
for (const method of ["state", "clear", "remove", "start", "pause", "tracks"] as const) expose(`offline.${method}`, async (...args: any[]) => {
 if (["clear", "start"].includes(method)) { const kind = args[method === "start" ? 1 : 0]; if (kind != null && !["music", "podcast", "video"].includes(kind)) throw new BackendError(400, "invalid_kind"); }
 if (method === "state") await offline.refreshOfflineTotals();
 if (method === "clear") await offline.clearOfflineFiles(args[0] ?? undefined);
 if (method === "remove") { if (!(await getTracks()).some(track => track.id === args[0])) throw new BackendError(404, "unknown_track"); await offline.removeOfflineFile(args[0]); }
 if (method === "start") void offline.startOfflineSync(!!args[0], args[1] ?? undefined).catch(() => {});
 if (method === "pause") offline.pauseOfflineSync();
 if (method === "tracks") { const known = new Set((await getTracks()).map(track => track.id)); if (!Array.isArray(args[0]) || args[0].some((id: string) => !known.has(id))) throw new BackendError(404, "unknown_track"); void offline.downloadTrackIds(args[0]).catch(() => {}); }
 return offline.getOfflineProgress();
}, { domain: "offline", write: ["clear", "remove"].includes(method), atomic: false });
