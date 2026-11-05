import { emitBackendChange } from "./remote";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
export type WebHostState = { enabled?: boolean; running: boolean; bundleId: string | null; port: number; lanAddress: string; batteryExempt: boolean; tuiRunning: boolean };
type NativeWeb = {
 interruptedWebTransfers?():Promise<string>;
 installWebPackage(uri: string): Promise<{ directory: string; bundleId: string }>;
 startWebInterface(directory: string, bundle: string): Promise<WebHostState>;
 stopWebInterface(): Promise<void>; webInterfaceState(): WebHostState;
 resolveWebRequest(id: string, result: string): void; publishWebEvent(json: string): void;
 openWebBatterySettings(): void;
 startWebChat(json: string): void;
 startWebJob(id: string, action: string): void;
 inspectWebPhoto(id: string): Promise<{ width: number; height: number; mime: string; bytes: number }>;
 createEmptyWebTransfer(id:string,name:string):Promise<void>;
 readWebTransferRecord(id:string):Promise<string>;
 cancelWebTransfer(id:string):Promise<string>;
 commitWebTransfer(id:string):Promise<void>;
 webTransferInfo(id: string): Promise<{ uri: string; state: string }>;
 updateWebTransfer(id: string, patch: string): Promise<void>;
};
export function webNative(): NativeWeb {
 const mod = Platform.OS === "android" ? requireOptionalNativeModule<NativeWeb>("NlcLanBridge") : null;
 if (!mod?.startWebInterface) throw new Error("Instala la nueva APK para usar la interfaz web"); return mod;
}
export function publishWebEvent(event: any) { if (event?.type === "change") emitBackendChange(event.domain); if (Platform.OS === "android") { try { webNative().publishWebEvent(JSON.stringify(event)); } catch { /* Older APKs cannot host the interface. */ } } }
