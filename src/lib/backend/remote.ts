import { createPendingCommands } from "./pending-commands";
import { editGeneration } from "./edit-drafts";
import { setPhoneClock } from "./clock";
export { phoneNow } from "./clock";
import { encodeMediaId } from "./media-id";
import { observeVersions, markEditDraft, hasEditDraft, discardEditDraft, expectedEditVersion, confirmEdit, rememberDraftFields, keepConflictDraft } from "./edit-drafts";
import { BackendError, type Bootstrap, type NlcBackend, type OperationOptions, type Reply, type Versions } from "./protocol";
import { PHONE_ONLY, remoteEnabled } from "./profile";
export type RemoteState = { connected: boolean; stale: boolean; busy: boolean; conflict:boolean; error: string | null; bootstrap: Bootstrap | null };
let state: RemoteState = { connected: false, stale: false, busy: false, conflict:false, error: null, bootstrap: null };
const listeners = new Set<() => void>();
const changes = new Set<(domain: string) => void>();
let started: Promise<Bootstrap> | null = null;
let events: EventSource | null = null;
const versions: Versions = {};

let pending = 0;
export function requestId(): string {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
function update(patch: Partial<RemoteState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
export const remoteState = { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
export function emitBackendChange(domain: string) { changes.forEach(fn => fn(domain)); }
export function onBackendChange(fn: (domain: string) => void) { changes.add(fn); return () => { changes.delete(fn); }; }
export function hasRemoteDraft() { return hasEditDraft(); }
export function markRemoteDraft() { markEditDraft(); rememberDraftFields(); }
export function discardRemoteDraft() { discardEditDraft(); }
export async function bootstrap(force = false): Promise<Bootstrap> {
  if (force) started = null;
  if (started) return started;
  started = (async () => {
    try {
      const response = await fetch("/api/v1/bootstrap", { cache: "no-store" }); if (!response.ok) throw new Error("Sin conexión con el móvil. Tu borrador se conserva.");
      const value: Bootstrap = await response.json();
      const build = document.querySelector('meta[name="nlc-web-bundle"]')?.getAttribute("content");
      if (value.protocol !== 1 || build && build !== value.bundleId) { update({ stale: true }); throw new BackendError(426, "Recarga la interfaz para continuar"); }
      setPhoneClock(value.clock, value.timeZone);
      const recovered = !state.connected;
      update({ connected: true, bootstrap: value, error: null });
      if (recovered) emitBackendChange("*");
      if (!events) {
        events = new EventSource("/api/v1/events");
        events.onopen = () => { const previouslyConnected=state.connected; started = null; void bootstrap().then(()=>{if(previouslyConnected)emitBackendChange("*");}).catch(() => {}); };
        events.onerror = () => update({ connected: false, error: "Sin conexión con el móvil. Tu borrador se conserva." });
        events.onmessage = message => {
          try { const event = JSON.parse(message.data); if (event.type === "change") changes.forEach(fn => fn(event.domain)); if (event.type === "capabilities") { started = null; void bootstrap(); } } catch { /* Ignore unknown future events. */ }
        };
      }
      return value;
    } catch (error) { started = null; update({ connected: false, error: error instanceof Error ? error.message : "phone_unavailable" }); throw error; }
  })(); return started;
}
const pendingCommands = createPendingCommands(requestId, typeof sessionStorage === "undefined" ? undefined : sessionStorage);
async function command<T>(operation: string, args: unknown[], options: OperationOptions): Promise<T> {
  if (options.phoneOnly) throw new BackendError(403, PHONE_ONLY);
  const device = await bootstrap(); if (state.stale) throw new BackendError(426, "Recarga la interfaz para continuar");
  const key = `${options.domain}:${options.key?.(args) ?? "$collection"}`;
  const expectedVersion = options.write ? expectedEditVersion(options.domain, key, true) : undefined;
  const sentGeneration = editGeneration();
  const intent = options.write ? pendingCommands.begin(operation, args, { expectedVersion, expectedDomainVersion: undefined }) : null;
  const payload = JSON.stringify({ protocol: 1, bundleId: device.bundleId, requestId: intent?.requestId ?? requestId(), operation, args, expectedVersion: intent?.expectedVersion ?? expectedVersion, expectedDomainVersion: intent?.expectedDomainVersion });
  pending++; update({ busy: true });
  try {
    let response: Response | undefined;
    // Same body/identifier on retry: the phone returns the original committed result.
    for (let attempt = 0; attempt < 2; attempt++) { try { response = await fetch("/api/v1/commands", { method: "POST", headers: { "Content-Type": "application/json", "X-NLC-Protocol": "1" }, body: payload }); break; } catch (error) { if (attempt === 1) throw error; } }
    if (!response) throw new Error("phone_unavailable");
    const value = await response.json();
    if (!response.ok) {
      if (intent && response.status < 500 && value.error !== "interrupted_operation_reload") pendingCommands.finish(intent.key);
      if(response.status===409){keepConflictDraft();update({connected:true,conflict:true,error:"El registro ha cambiado. Recarga para revisarlo; el borrador se conserva."});}
      if (response.status === 426) update({ stale: true });
      throw new BackendError(response.status, response.status === 409 && value.error === "interrupted_operation_reload" ? "La operación está pendiente. Recarga para comprobar su resultado." : response.status === 409 ? "El registro ha cambiado. Conservamos tu borrador; recarga el registro antes de guardarlo." : value.error || "No se pudo guardar", value);
    }
    const reply = value as Reply<T>; Object.assign(versions, reply.versions); observeVersions(reply.versions);
    if (intent) pendingCommands.finish(intent.key);
    if (options.write) confirmEdit(options.domain, sentGeneration, reply.versions);
    update({ connected: true, error: null }); return reply.data;
  } catch (error) {
    if (!(error instanceof BackendError)) update({ connected: false, error: "Sin conexión con el móvil. Tu borrador se conserva." });
    throw error;
  } finally { pending--; update({ busy: pending > 0 }); }
}
export const browserBackend: NlcBackend = { invoke: command };
export function mediaUrl(kind: string, id: string) { return `/api/v1/media/${encodeURIComponent(kind)}/${encodeMediaId(id)}`; }

// The SSE socket may reconnect before Headless JS has finished a cold start.
// Keep retrying bootstrap until the phone is ready, without replaying user writes.
if(remoteEnabled&&typeof window!=="undefined")setInterval(()=>{if(!state.connected&&!state.stale)void bootstrap().catch(()=>{});},2000);
