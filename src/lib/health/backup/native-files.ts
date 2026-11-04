import { BackupError, MAX_BACKUP_BYTES } from "./model";

export const BINARY_READ_CHUNK_BYTES = 1024 * 1024;
export type BinaryReadHandle = {
  offset: number | null;
  readBytes(length: number): Uint8Array;
  close(): void;
};

// A single destination buffer avoids full-file Base64 strings on Android's
// smaller Java heap. The native bridge only transports one bounded chunk.
export async function readBinaryChunks(size: number, limit: number, open: () => BinaryReadHandle): Promise<Uint8Array> {
  if (!Number.isSafeInteger(size) || size < 0 || size > limit) throw new BackupError("size");
  const result = new Uint8Array(size);
  const handle = open();
  try {
    if (handle.offset !== 0) throw new BackupError("integrity");
    for (let offset = 0; offset < size;) {
      const count = Math.min(BINARY_READ_CHUNK_BYTES, size - offset);
      const bytes = handle.readBytes(count);
      if (bytes.byteLength !== count || handle.offset !== offset + count) throw new BackupError("integrity");
      result.set(bytes, offset);
      offset += count;
      if (offset < size && offset % (8 * BINARY_READ_CHUNK_BYTES) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (handle.readBytes(1).byteLength !== 0) throw new BackupError("integrity");
    return result;
  } finally {
    handle.close();
  }
}

async function androidFile(uri: string) {
  // Load only when used so an older APK can still open the app and show the
  // existing update-required message instead of failing during root imports.
  const { requireOptionalNativeModule } = await import("expo-modules-core");
  if (!requireOptionalNativeModule("FileSystem")) throw new BackupError("nativeUpdate");
  const { File } = await import("expo-file-system");
  return new File(uri);
}

export async function readAndroidBackupFile(uri: string, limit: number): Promise<Uint8Array> {
  const file = await androidFile(uri);
  if (!file.exists) throw new BackupError("missingPhoto");
  const size = file.size;
  if (size === null) throw new BackupError("storage");
  return readBinaryChunks(size, limit, () => file.open());
}

export async function writeAndroidBackupFile(uri: string, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > MAX_BACKUP_BYTES) throw new BackupError("size");
  const file = await androidFile(uri);
  file.write(bytes);
  if (file.size !== bytes.byteLength) throw new BackupError("storage");
}
