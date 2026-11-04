import { BodyPhotoError, MAX_PHOTO_BYTES, detectPhotoMime, validatePhoto, type PickedBodyPhoto } from "./model";

export async function prepareBodyFile(file: Blob): Promise<PickedBodyPhoto> {
  if (!file.size || file.size > 30 * 1024 * 1024) throw new BodyPhotoError("size");
  detectPhotoMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  const uri = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = uri; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 36_000_000) throw new BodyPhotoError("dimensions");
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new BodyPhotoError("type");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const prepared = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new BodyPhotoError("type")), "image/jpeg", 0.85));
    if (prepared.size > MAX_PHOTO_BYTES) throw new BodyPhotoError("size");
    const input = { mime: "image/jpeg" as const, bytes: prepared.size, width: canvas.width, height: canvas.height }; validatePhoto(input);
    URL.revokeObjectURL(uri); const previewUri = URL.createObjectURL(prepared);
    return { ...input, source: prepared, previewUri, dispose() { URL.revokeObjectURL(previewUri); } };
  } catch (error) { URL.revokeObjectURL(uri); throw error instanceof BodyPhotoError ? error : new BodyPhotoError("type"); }
}
export function pickBodyPhoto(): Promise<PickedBodyPhoto | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("aria-label", "Select body photo"); input.style.display = "none"; document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener("cancel", () => { cleanup(); resolve(null); }, { once: true });
    input.addEventListener("change", () => {
      const file = input.files?.[0]; cleanup(); if (!file) { resolve(null); return; }
      void prepareBodyFile(file).then(resolve, reject);
    }, { once: true });
    input.click();
  });
}
