import { MercuryError, normalizeMercuryToken, type MercuryErrorCode } from "./mercury-api";
import { validateSnapshot, type MercurySnapshot } from "./model";

export const MERCURY_SYNC_INTERVAL = 15 * 60000;
export type MobileMercuryError = MercuryErrorCode | "accountChanged";
export type MobileMercuryState = Readonly<{
  ready: boolean; configured: boolean; busy: boolean; error: MobileMercuryError | null;
  pending: MercurySnapshot | null; retryAt: number;
}>;
export type SyncOutcome = "saved" | "pending" | "skipped" | "cancelled";
export type MobileMercuryOptions = {
  secrets: { read(): Promise<string | null>; write(token: string): Promise<void>; remove(): Promise<void> };
  collect(token: string, signal: AbortSignal): Promise<MercurySnapshot>;
  current(): MercurySnapshot | null;
  save(snapshot: MercurySnapshot): Promise<void>;
  allowAutomatic?(): boolean;
  now?(): number;
};

export function createMobileMercury(options: MobileMercuryOptions) {
  const now = options.now ?? Date.now;
  let state: MobileMercuryState = { ready: false, configured: false, busy: false, error: null, pending: null, retryAt: 0 };
  let token: string | null = null;
  let generation = 0; let configRevision = 0; let mutations = 0; let failures = 0; let autoBlocked = false;
  let loading: Promise<void> | null = null;
  let secretWrites: Promise<unknown> = Promise.resolve();
  let inFlight: Promise<SyncOutcome> | null = null; let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  function update(patch: Partial<MobileMercuryState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  }
  function queueSecret<T>(operation: () => Promise<T>): Promise<T> {
    const next = secretWrites.then(operation); secretWrites = next.catch(() => {}); return next;
  }
  function invalidate() { generation++; request?.abort(); }
  function cancel() { if (request) invalidate(); }
  function load() {
    return loading ??= (async () => {
      const revision = configRevision;
      try {
        const stored = await queueSecret(options.secrets.read);
        if (revision !== configRevision) return;
        token = stored ? normalizeMercuryToken(stored) : null; autoBlocked = false;
        update({ configured: !!token, error: null });
      } catch { if (revision === configRevision) { autoBlocked = true; update({ error: "storage" }); } }
      finally { update({ ready: true }); }
    })();
  }
  async function configure(input: string) {
    const nextToken = normalizeMercuryToken(input);
    const revision = ++configRevision; invalidate(); mutations++;
    update({ busy: true, error: null, pending: null });
    try {
      await queueSecret(() => options.secrets.write(nextToken));
      if (revision !== configRevision) return;
      token = nextToken; failures = 0; autoBlocked = false;
      update({ ready: true, configured: true, retryAt: 0 });
    } catch { if (revision === configRevision) update({ error: "storage" }); throw new MercuryError("storage"); }
    finally { mutations--; update({ busy: mutations > 0 || !!inFlight }); }
  }
  async function disconnect() {
    const revision = ++configRevision; invalidate(); mutations++;
    update({ busy: true, pending: null });
    try {
      await queueSecret(options.secrets.remove);
      if (revision !== configRevision) return;
      token = null; failures = 0; autoBlocked = false;
      update({ ready: true, configured: false, error: null, retryAt: 0 });
    } catch { autoBlocked = true; if (revision === configRevision) update({ error: "storage" }); throw new MercuryError("storage"); }
    finally { mutations--; update({ busy: mutations > 0 || !!inFlight }); }
  }
  function sync(automatic = false): Promise<SyncOutcome> {
    if (inFlight) return inFlight;
    if (!state.ready || mutations || state.busy) return Promise.resolve("skipped");
    if (!token) return automatic ? Promise.resolve("skipped") : Promise.reject(new MercuryError("configure"));
    if (automatic && (autoBlocked || state.pending || options.allowAutomatic?.() === false)) return Promise.resolve("skipped");
    if (now() < state.retryAt && (automatic || state.error === "rateLimit")) {
      return automatic ? Promise.resolve("skipped") : Promise.reject(new MercuryError("rateLimit", state.retryAt));
    }
    const lastSync = Date.parse(options.current()?.syncedAt ?? "");
    if (automatic && Number.isFinite(lastSync) && lastSync <= now() && now() - lastSync < MERCURY_SYNC_INTERVAL) return Promise.resolve("skipped");
    const version = generation; const credential = token; const active = new AbortController(); request = active;
    update({ busy: true, error: null, pending: null });
    const task = Promise.resolve().then(async (): Promise<SyncOutcome> => {
      try {
        const snapshot = await options.collect(credential, active.signal);
        if (version !== generation || active.signal.aborted) return "cancelled";
        validateSnapshot(snapshot, "mercury");
        if (snapshot.mode !== "live") throw new MercuryError("invalid");
        const previous = options.current();
        if (previous && previous.owner !== snapshot.owner) {
          autoBlocked = true; update({ pending: snapshot, error: "accountChanged", retryAt: 0 }); return "pending";
        }
        try { await options.save(snapshot); } catch { throw new MercuryError("storage"); }
        if (version !== generation) return "cancelled";
        failures = 0; autoBlocked = false; update({ error: null, retryAt: 0 }); return "saved";
      } catch (error) {
        if (version !== generation || active.signal.aborted) return "cancelled";
        const safe = error instanceof MercuryError ? error : new MercuryError("invalid");
        if (safe.code === "cancelled") return "cancelled";
        failures++; autoBlocked = ["auth", "storage", "invalid", "currency", "pagination", "size"].includes(safe.code);
        const retryAt = safe.code === "rateLimit" ? Math.max(now() + 60000, safe.retryAt) : now() + Math.min(15 * 60000, 30000 * 2 ** Math.min(failures - 1, 5));
        update({ error: safe.code, retryAt }); throw safe;
      } finally {
        if (request === active) request = null;
        inFlight = null; update({ busy: mutations > 0 });
      }
    });
    inFlight = task; return task;
  }
  async function acceptPending() {
    const value = state.pending;
    if (!value || state.busy) return;
    const version = generation; update({ busy: true });
    try {
      await options.save(value);
      if (version !== generation) return;
      failures = 0; autoBlocked = false; update({ pending: null, error: null, retryAt: 0 });
    } catch { update({ error: "storage" }); throw new MercuryError("storage"); }
    finally { update({ busy: mutations > 0 || !!inFlight }); }
  }
  function rejectPending() { autoBlocked = true; update({ pending: null, error: "accountChanged" }); }
  async function retryStorage() { loading = null; await load(); }
  return { getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, configure, disconnect, sync: () => sync(), tick: () => sync(true), acceptPending, rejectPending, retryStorage, cancel };
}
export type MobileMercury = ReturnType<typeof createMobileMercury>;
