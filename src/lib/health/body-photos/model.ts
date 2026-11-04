import { isDateKey, localDateKey } from "../weight/model";

export const BODY_POSES = ["front", "left", "right", "back"] as const;
export type BodyPose = (typeof BODY_POSES)[number];
export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export type BodyPhoto = { id: string; mime: PhotoMime; bytes: number; width: number; height: number };
export type PhotoImport = Omit<BodyPhoto, "id"> & { source: unknown };
export type PickedBodyPhoto = PhotoImport & { previewUri: string; dispose(): Promise<void> | void };
export type BodyReview = {
  id: string; date: string; note: string; photos: Partial<Record<BodyPose, BodyPhoto>>; createdAt: number; updatedAt: number;
};
export type BodyErrorCode = "date" | "future" | "note" | "type" | "size" | "dimensions" | "conflict" | "missing" | "invalid" | "unsupported" | "nativeUpdate";
export class BodyPhotoError extends Error { constructor(public code: BodyErrorCode) { super(code); } }
export function bodyId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
export function validBodyId(id: string): boolean { return typeof id === "string" && /^[\w-]{1,100}$/.test(id); }
export function photoExtension(mime: PhotoMime): string { return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"; }
export function detectPhotoMime(bytes: Uint8Array): PhotoMime {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  throw new BodyPhotoError("type");
}
export function validatePhoto(input: Omit<BodyPhoto, "id">): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.mime)) throw new BodyPhotoError("type");
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > MAX_PHOTO_BYTES) throw new BodyPhotoError("size");
  if (![input.width, input.height].every((value) => Number.isInteger(value) && value > 0 && value <= 10000) || input.width * input.height > 36_000_000) throw new BodyPhotoError("dimensions");
}
export function normalizeBodyInput(date: string, note: string, today = localDateKey()) {
  if (!isDateKey(date)) throw new BodyPhotoError("date");
  if (date > today) throw new BodyPhotoError("future");
  if (typeof note !== "string" || note.length > 2000) throw new BodyPhotoError("note");
  return { date, note: note.trim() };
}
export function validateBodyReview(entry: BodyReview): BodyReview {
  if (!entry || !validBodyId(entry.id) || !isDateKey(entry.date) || typeof entry.note !== "string" || entry.note.length > 2000 || !entry.photos || typeof entry.photos !== "object" || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) throw new BodyPhotoError("invalid");
  const ids = new Set<string>();
  for (const [pose, photo] of Object.entries(entry.photos)) {
    if (!BODY_POSES.includes(pose as BodyPose) || !photo || !validBodyId(photo.id) || ids.has(photo.id)) throw new BodyPhotoError("invalid");
    validatePhoto(photo); ids.add(photo.id);
  }
  return entry;
}
export function sortBodyReviews(entries: BodyReview[]): BodyReview[] { return [...entries].sort((a, b) => b.date.localeCompare(a.date)); }
export function bodyPhotoCount(entry: BodyReview): number { return Object.keys(entry.photos).length; }
export function comparisonPair(entries: BodyReview[], selectedId?: string): [string | null, string | null] {
  const sorted = sortBodyReviews(entries.filter((entry) => bodyPhotoCount(entry) > 0)); const index = selectedId ? sorted.findIndex((entry) => entry.id === selectedId) : 0;
  const current = sorted[Math.max(0, index)];
  const earlier = sorted.slice(Math.max(0, index) + 1).find((entry) => bodyPhotoCount(entry) > 0) ?? sorted.find((entry) => entry.id !== current?.id && bodyPhotoCount(entry) > 0);
  if (!current) return [null, null];
  if (!earlier) return [null, current.id];
  return earlier.date < current.date ? [earlier.id, current.id] : [current.id, earlier.id];
}
