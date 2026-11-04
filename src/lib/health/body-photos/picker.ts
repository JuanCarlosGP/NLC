import * as FileSystem from "expo-file-system/legacy";
import { requireOptionalNativeModule } from "expo-modules-core";
import { BodyPhotoError, validatePhoto, type PickedBodyPhoto } from "./model";

export async function pickBodyPhoto(): Promise<PickedBodyPhoto | null> {
  // Older APKs can still open NLC; native photo imports need the rebuilt binary.
  if (!requireOptionalNativeModule("ExponentImagePicker") || !requireOptionalNativeModule("ExpoImageManipulator")) throw new BodyPhotoError("nativeUpdate");
  const ImagePicker = await import("expo-image-picker");
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1, exif: false, base64: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset?.width || !asset.height) throw new BodyPhotoError("dimensions");
  if (asset.fileSize !== undefined && asset.fileSize > 30 * 1024 * 1024) throw new BodyPhotoError("size");
  const ImageManipulator = await import("expo-image-manipulator");
  const scale = Math.min(1, 1800 / Math.max(asset.width, asset.height));
  const image = await ImageManipulator.manipulateAsync(asset.uri,
    [{ resize: { width: Math.max(1, Math.round(asset.width * scale)), height: Math.max(1, Math.round(asset.height * scale)) } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  try {
    const info = await FileSystem.getInfoAsync(image.uri);
    if (!info.exists || info.isDirectory) throw new BodyPhotoError("missing");
    const input = { mime: "image/jpeg" as const, bytes: info.size, width: image.width, height: image.height }; validatePhoto(input);
    return { ...input, source: image.uri, previewUri: image.uri, dispose: () => FileSystem.deleteAsync(image.uri, { idempotent: true }) };
  } catch (error) { await FileSystem.deleteAsync(image.uri, { idempotent: true }).catch(() => {}); throw error; }
}
