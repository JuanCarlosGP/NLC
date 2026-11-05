import * as FileSystem from "expo-file-system/legacy";
import { requireOptionalNativeModule } from "expo-modules-core";
import { NutritionError } from "./model";
import { MAX_CSV_BYTES } from "./macrofactor";
export async function pickNutritionCsv(): Promise<{ name: string; text: string; days?: import("./model").ImportedDay[] } | null> {
  if (!requireOptionalNativeModule("ExpoDocumentPicker")) throw new NutritionError("nativeUpdate");
  const DocumentPicker = await import("expo-document-picker");
  const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return null;
  const file = picked.assets[0];
  try {
    if (!/\.csv$/i.test(file.name)) throw new NutritionError("headers");
    const info = await FileSystem.getInfoAsync(file.uri);
    if (!info.exists || info.isDirectory) throw new NutritionError("missing");
    if (info.size > MAX_CSV_BYTES) throw new NutritionError("size");
    return { name: file.name, text: await FileSystem.readAsStringAsync(file.uri) };
  } finally {
    if (FileSystem.cacheDirectory && file.uri.startsWith(`${FileSystem.cacheDirectory}DocumentPicker/`)) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  }
}
