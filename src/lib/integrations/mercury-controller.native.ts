import { fetch as nativeFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { fetchMercurySnapshot } from "./mercury-api";
import { createMobileMercury } from "./mercury-mobile";
import { createIntegrationCache } from "./cache";
import { integrationStorage } from "./storage";
import type { MercurySnapshot } from "./model";
import { publishWebEvent } from "@/lib/backend/native-module";
const TOKEN_KEY = "nlc.integrations.mercury.token.v1";
const cache = createIntegrationCache(integrationStorage);
let current: MercurySnapshot | null = null;
export const mercuryController = createMobileMercury({
 secrets: { read: () => SecureStore.getItemAsync(TOKEN_KEY), write: token => SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), remove: () => SecureStore.deleteItemAsync(TOKEN_KEY) },
 collect: (token, signal) => fetchMercurySnapshot(token, nativeFetch, signal), current: () => current,
 save: async snapshot => { await cache.write(snapshot); current = snapshot; publishWebEvent({ type: "change", domain: "integrations" }); },
});
let initialized: Promise<void> | null = null;
export function loadMercuryController() { return initialized ??= (async () => { const copy = await cache.read("mercury", "live"); current = copy?.provider === "mercury" ? copy : null; await mercuryController.load(); })().catch(error => { initialized = null; throw error; }); }
mercuryController.subscribe(() => publishWebEvent({ type: "change", domain: "mercury" }));

export const currentMercurySnapshot = () => current;

// Imports and desktop edits replace the durable copy. Never overwrite them with an old hook snapshot.
import { onServiceImport } from "@/lib/service-backup/events";
import { onBackendChange } from "@/lib/backend/remote";
async function reloadMercuryCopy() { const copy = await cache.read("mercury", "live"); current = copy?.provider === "mercury" ? copy : null; }
onServiceImport(service => { if (service === "wealth") void reloadMercuryCopy().catch(() => {}); });
onBackendChange(domain => { if (domain === "integrations" || domain === "*") void reloadMercuryCopy().catch(() => {}); });

import * as Crypto from "expo-crypto";
import { webNative } from "@/lib/backend/native-module";
const desktopTasks = new Map<string, Promise<unknown>>();
export async function startMercuryTask(method: "sync" | "acceptPending") {
 await loadMercuryController();
 const id = Crypto.randomUUID();
 const task = mercuryController[method]();
 // Attach the rejection handler before releasing the command queue.
 desktopTasks.set(id, task.catch(() => {}));
 webNative().startWebJob(id, "mercury-sync");
 return mercuryController.getSnapshot();
}
export async function finishMercuryTask(id: string) {
 try { await desktopTasks.get(id); } finally { desktopTasks.delete(id); }
}
