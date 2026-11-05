import { serialize } from "./write-queue";
import {rememberSourceResult} from "./known-media.native";
import { handleBridgeRequest } from "@/lib/bridge/handle-request";
import { createMusicSource } from "@/lib/nas/source-factory";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { resolveBridgeJson, resolveBridgeStream, failBridgeRequest, stopLanBridge } from "nlc-lan-bridge";
import { clearBridgeSession } from "@/lib/bridge/session";
export async function handleLegacyTask(body: string) {
 const request = JSON.parse(body);
 try {
  const source = createMusicSource(await loadNasSettings(), await loadNasPassword());
  const result = await handleBridgeRequest(source, request.path, request.query);
  if (result.kind === "stream") resolveBridgeStream(request.id, result.uri, result.headers);
  else {if(request.path!=="/v1/device")await serialize(()=>rememberSourceResult(result.body));resolveBridgeJson(request.id, result.status, result.body); }
  if (request.path === "/v1/bye") { await stopLanBridge(); await clearBridgeSession(); }
 } catch (error) { failBridgeRequest(request.id, 500, error instanceof Error ? error.message : "bridge"); }
}
