import type { Versions } from "./protocol";
import { remoteEnabled } from "./profile";
const known: Versions = {};
let currentDomain = "catalog";
let currentPath = "/";
let zoneDomain = "catalog";
let generation = 0;
let draft: { domain: string; versions: Versions; generation?: number } | null = null;
const KEY = "nlc.remote.edit-draft.v1";
try { if (remoteEnabled && typeof sessionStorage !== "undefined") draft = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch {}
export function editDomain(path: string): string {
 if (path.includes("/health/training")) return "training";
 if (path.includes("/health/weight")) return "weight";
 if (path.includes("/health/medication")) return "medication";
 if (path.includes("/health/nutrition")) return "nutrition";
 if (path.includes("/health/body-photos")) return "body";
 if (path.startsWith("/wealth") || path.includes("/asset")) return "wealth";
 if (/project|task|focus/.test(path)) return "tasks";
 if (path.includes("reminder")) return "reminders";
 if (path.includes("settings")) return "settings";
 if (path.includes("imported") || path.includes("playlist")) return "playlists";
 return path === "/" || path === "/library" ? zoneDomain : "catalog";
}
export function setEditPath(path: string) { currentPath = path; currentDomain = editDomain(path); }
export function setEditZone(zone: string) { zoneDomain = ({ health: "weight", wealth: "wealth", focus: "tasks", music: "catalog", podcast: "catalog", video: "videoHistory" } as Record<string, string>)[zone] || "catalog"; currentDomain = editDomain(currentPath); }
export function observeVersions(value: Versions) { for (const [key, version] of Object.entries(value)) known[key] = Math.max(known[key] ?? 0, version); }
export function markEditDraft(domain?: string) {
 domain ??= remoteEnabled && typeof window !== "undefined" ? editDomain(window.location.pathname) : currentDomain;
 if (!draft || draft.domain !== domain) draft = { domain, versions: { ...known } };
 draft.generation = ++generation; persist(); return generation;
}
export function editGeneration() { return draft?.generation ?? 0; }
export function hasEditDraft() { return draft !== null; }
export function expectedEditVersion(domain: string, key: string, requireKnown = false) { return draft?.domain === domain ? draft.versions[key] ?? 0 : requireKnown ? known[key] ?? 0 : undefined; }
export function confirmEdit(domain: string, sentGeneration = editGeneration(), committed: Versions = {}) {
 if (draft?.domain !== domain) return;
 if ((draft.generation ?? 0) !== sentGeneration) {
  // More typing happened during this request. Advance only to our acknowledged revision.
  for (const [key, version] of Object.entries(committed)) draft.versions[key] = Math.max(draft.versions[key] ?? 0, version);
  persist(); return;
 }
 draft = null; if (remoteEnabled && typeof sessionStorage !== "undefined") { sessionStorage.removeItem(KEY); sessionStorage.removeItem("nlc.remote.draft-fields.v1"); }
}
export function discardEditDraft() { draft = null; if (remoteEnabled && typeof sessionStorage !== "undefined") sessionStorage.removeItem(KEY); }
function persist() { if (remoteEnabled && typeof sessionStorage !== "undefined") try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch {} }
// Values stay in this browser. Secure fields are deliberately excluded.
export function rememberDraftFields() {
 if (!remoteEnabled || typeof document === "undefined") return;
 const fields = Array.from(document.querySelectorAll("input,textarea")).filter(element => !(element as HTMLInputElement).disabled && (element as HTMLInputElement).type !== "password").map((element, index) => ({ label: element.getAttribute("aria-label") || element.getAttribute("placeholder") || "", index, value: (element as HTMLInputElement).value })).filter(field => field.value && !/password|contrase|token|api.?key|clave/i.test(field.label));
 try { sessionStorage.setItem("nlc.remote.draft-fields.v1", JSON.stringify({ path: location.pathname + location.search, fields })); } catch {}
}
export function restoreDraftField(label: string): string | null {
 if (!remoteEnabled || typeof sessionStorage === "undefined" || !label || /password|contrase|token|api.?key|clave/i.test(label)) return null;
 try { const saved = JSON.parse(sessionStorage.getItem("nlc.remote.draft-fields.v1") || "null"); if (saved?.path !== location.pathname + location.search) return null; return saved.fields.find((field: { label: string }) => field.label === label)?.value ?? null; } catch { return null; }
}

export function keepConflictDraft(){rememberDraftFields();if(typeof sessionStorage!=="undefined"){const value=sessionStorage.getItem("nlc.remote.draft-fields.v1");if(value)sessionStorage.setItem("nlc.remote.conflict-draft.v1",value);}}
export function reloadConflictRecord(){draft=null;sessionStorage.removeItem(KEY);sessionStorage.removeItem("nlc.remote.draft-fields.v1");window.location.reload();}
export function conflictDraft():{fields:{label:string;value:string}[]}|null {if(!remoteEnabled||typeof sessionStorage==="undefined")return null;try{return JSON.parse(sessionStorage.getItem("nlc.remote.conflict-draft.v1")||"null");}catch{return null;}}
