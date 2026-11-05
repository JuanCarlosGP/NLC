import { Asset } from "expo-asset";
import { webNative } from "./native-module";
let installed: Promise<{ directory: string; bundleId: string }> | null = null;
export function installWebPackage() {
 return installed ??= (async () => {
  const asset = Asset.fromModule(require("../../../assets/generated/phone-web.zip"));
  await asset.downloadAsync(); if (!asset.localUri) throw new Error("No se pudo preparar la interfaz web");
  return webNative().installWebPackage(asset.localUri);
 })().catch(error => { installed = null; throw error; });
}
