import { strFromU8, strToU8, zipSync, type Zippable } from "fflate";
import { detectPhotoMime, photoExtension } from "../body-photos/model";
import { BackupError, MAX_BACKUP_BYTES, MAX_BACKUP_FILES, MAX_MANIFEST_BYTES, photoList, validateHealthData, type DecodedBackup, type HealthSnapshot } from "./model";
export type HashBytes = (bytes: Uint8Array) => Promise<string>;
const filename = (id: string, mime: Parameters<typeof photoExtension>[0]) => `photos/${id}.${photoExtension(mime)}`;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; return crc >>> 0; });
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
export async function encodeBackup(snapshot: HealthSnapshot, hash: HashBytes, createdAt = new Date().toISOString()): Promise<Uint8Array> {
  const data = validateHealthData(snapshot.data); const files: Zippable = Object.create(null); const descriptors = [];
  let total = 0;
  for (const photo of photoList(data)) {
    const bytes = snapshot.photos.get(photo.id);
    if (!bytes || bytes.length !== photo.bytes || detectPhotoMime(bytes) !== photo.mime) throw new BackupError("missingPhoto");
    total += bytes.length; if (total > MAX_BACKUP_BYTES) throw new BackupError("size");
    const path = filename(photo.id, photo.mime); files[path] = [bytes, { level: 0 }]; descriptors.push({ id: photo.id, path, sha256: await hash(bytes) });
  }
  const dataBytes = strToU8(JSON.stringify(data));
  if (dataBytes.length > MAX_MANIFEST_BYTES) throw new BackupError("size");
  const manifest = strToU8(JSON.stringify({ format: "nlc-health", version: 1, createdAt, dataSha256: await hash(dataBytes), data, photos: descriptors }));
  if (manifest.length > MAX_MANIFEST_BYTES || total + manifest.length > MAX_BACKUP_BYTES) throw new BackupError("size");
  files["manifest.json"] = [manifest, { level: 0 }];
  const archive = zipSync(files); if (archive.length > MAX_BACKUP_BYTES) throw new BackupError("size"); return archive;
}
// Inspect the directory and local headers before allocating/decompressing any entry.
// Only the known manifest and validated photo paths are accepted; no paths are extracted.
export function inspectBackupZip(bytes: Uint8Array): Map<string, { size: number; start: number; crc: number }> {
  if (bytes.length > MAX_BACKUP_BYTES) throw new BackupError("size");
  if (bytes.length < 22) throw new BackupError("format");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new BackupError("format");
  const count = view.getUint16(end + 10, true); const size = view.getUint32(end + 12, true); const offset = view.getUint32(end + 16, true);
  if (!count || count > MAX_BACKUP_FILES) throw new BackupError("size");
  if (count !== view.getUint16(end + 8, true) || offset + size !== end) throw new BackupError("format");
  const names = new Map<string, { size: number; start: number; crc: number }>(); const ranges: [number, number][] = []; let cursor = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new BackupError("format");
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), compressed = view.getUint32(cursor + 20, true), original = view.getUint32(cursor + 24, true);
    const n = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), local = view.getUint32(cursor + 42, true);
    if (cursor + 46 + n + extra + comment > end || flags & ~0x800 || method !== 0 || view.getUint16(cursor + 34, true)) throw new BackupError("format");
    const name = strFromU8(bytes.subarray(cursor + 46, cursor + 46 + n));
    if (names.has(name) || !(name === "manifest.json" || /^photos\/[\w-]{1,100}\.(jpg|png|webp)$/.test(name))) throw new BackupError("format");
    total += original; if (total > MAX_BACKUP_BYTES || original > (name === "manifest.json" ? MAX_MANIFEST_BYTES : 10 * 1024 * 1024)) throw new BackupError("size");
    if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) throw new BackupError("format");
    const localName = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true); const start = local + 30 + localName + localExtra;
    if (start > offset || start + compressed > offset || view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags || strFromU8(bytes.subarray(local + 30, local + 30 + localName)) !== name) throw new BackupError("format");
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== original)) throw new BackupError("format");
    if (method === 0 && compressed !== original) throw new BackupError("format");
    const crc = view.getUint32(cursor + 16, true);
    if (!(flags & 8) && view.getUint32(local + 14, true) !== crc) throw new BackupError("integrity");
    ranges.push([local, start + compressed]); names.set(name, { size: original, start, crc }); cursor += 46 + n + extra + comment;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (cursor !== end || !names.has("manifest.json") || ranges.some((row, i) => i > 0 && row[0] < ranges[i - 1][1])) throw new BackupError("format");
  return names;
}
export async function decodeBackup(bytes: Uint8Array, hash: HashBytes): Promise<DecodedBackup> {
  try {
    const entries = inspectBackupZip(bytes); const files: Record<string, Uint8Array> = Object.create(null);
    for (const [name, entry] of entries) { const content = bytes.subarray(entry.start, entry.start + entry.size); if (crc32(content) !== entry.crc) throw new BackupError("integrity"); files[name] = content; }
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    if (manifest?.format !== "nlc-health") throw new BackupError("format");
    if (manifest.version !== 1) throw new BackupError("version");
    if (typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.photos)) throw new BackupError("format");
    const data = validateHealthData(manifest.data);
    if (await hash(strToU8(JSON.stringify(data))) !== manifest.dataSha256) throw new BackupError("integrity");
    const photos = new Map<string, Uint8Array>(); const expected = photoList(data);
    if (manifest.photos.length !== expected.length || entries.size !== expected.length + 1) throw new BackupError("integrity");
    const descriptors = new Map<string, { path: string; sha256: string }>();
    for (const descriptor of manifest.photos) { if (!descriptor || typeof descriptor.id !== "string" || descriptors.has(descriptor.id) || !/^[a-f0-9]{64}$/.test(descriptor.sha256)) throw new BackupError("integrity"); descriptors.set(descriptor.id, descriptor); }
    for (const photo of expected) {
      const descriptor = descriptors.get(photo.id); const path = filename(photo.id, photo.mime); const image = files[path];
      if (!descriptor || descriptor.path !== path || !image || image.length !== photo.bytes || detectPhotoMime(image) !== photo.mime || await hash(image) !== descriptor.sha256) throw new BackupError("integrity");
      photos.set(photo.id, image);
    }
    return { data, photos, createdAt: manifest.createdAt };
  } catch (error) { throw error instanceof BackupError ? error : new BackupError("format"); }
}
