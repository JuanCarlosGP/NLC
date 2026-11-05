import { useEffect, useMemo, useState } from "react";
import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend, onBackendChange } from "@/lib/backend/remote";
import type { MobileMercuryConnection, MobileMercuryHookOptions } from "./mobile-types";
import type { MobileMercuryState, SyncOutcome } from "./mercury-mobile";
export function useMobileMercury(options: MobileMercuryHookOptions): MobileMercuryConnection | null {
 const [state, setState] = useState<MobileMercuryState>({ ready: false, configured: false, busy: false, error: null, pending: null, retryAt: 0 });
 async function call(method: string, args: unknown[] = []) { const next = await browserBackend.invoke<MobileMercuryState>(`mercury.${method}`, args, { domain: "mercury", write: !["state","sync","acceptPending"].includes(method), atomic: false }); setState(next); return next; }
 useEffect(() => { if (!remoteEnabled || !options.ready) return; const refresh = () => { void call("state").catch(() => {}); }; refresh(); return onBackendChange(domain => { if (["mercury", "*"].includes(domain)) refresh(); }); }, [options.ready]);
 return useMemo(() => !remoteEnabled ? null : ({ state, configure: async token => {await call("configure", [token]);}, disconnect: async () => {await call("disconnect");}, sync: async () => { let next = await call("sync"); while(next.busy) { await new Promise(resolve=>setTimeout(resolve,500)); next=await call("state"); } if(next.error && !next.pending)throw new Error(next.error);return (next.pending?"pending":"saved") as SyncOutcome; }, acceptPending: async () => {let next=await call("acceptPending");while(next.busy){await new Promise(resolve=>setTimeout(resolve,500));next=await call("state");}if(next.error)throw new Error(next.error);}, rejectPending: () => { void call("rejectPending"); }, retryStorage: async () => {await call("retryStorage");} }), [state]);
}
