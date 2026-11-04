import { parseSnapshot, type Provider, type Snapshot } from "./model";
export type ConnectionStatus = { configured: boolean; connected: boolean; missing: string[]; busy: boolean; lastSync: string | null; error: string | null; automaticMinutes: number };
export type BridgeStatus = Record<Provider,ConnectionStatus>;
export class ConnectionError extends Error { constructor(public code: string) { super(code); } }
export const integrationBase = (process.env.EXPO_PUBLIC_NLC_INTEGRATIONS_URL || "http://127.0.0.1:8087").replace(/\/$/, "");
const codes = new Set(["auth","configure","connect","busy","rateLimit","network","upstream","pagination","invalid","size","storage","currency","state","consent"]);
export async function bridgeRequest(path: string, post = false): Promise<unknown> {
  try {
    const response = await fetch(`${integrationBase}${path}`,{ method: post ? "POST" : "GET", credentials:"include", headers:{"X-NLC-Client":"1"}, signal:AbortSignal.timeout(path.endsWith("/sync")?600000:30000) });
    const text=await response.text();
    if (!response.ok) { let code="upstream";try { const payload=JSON.parse(text);if(codes.has(payload.error))code=payload.error; }catch{} throw new ConnectionError(code); }
    if (path.endsWith("/snapshot") && text==="null") return null;
    return path.endsWith("/snapshot") || path.endsWith("/sync") || path.endsWith("/example") ? parseSnapshot(text,path.split("/")[1] as Provider) : JSON.parse(text);
  } catch(error) { throw error instanceof ConnectionError ? error : new ConnectionError(error instanceof Error && error.message === "invalid" ? "invalid" : "network"); }
}
export async function bridgeSnapshot(provider: Provider, action: "snapshot" | "sync" | "example"): Promise<Snapshot | null> { return await bridgeRequest(`/${provider}/${action}`,action!=="snapshot") as Snapshot | null; }
