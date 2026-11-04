import { getDb } from "@/lib/db/client";
export const importEpochKey = (service: string) =>
  `service_imported_at:${service}`;
export async function serviceImportEpoch(service: string) {
  const row = await (
    await getDb()
  ).getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    importEpochKey(service),
  );
  const time = Number(row?.value ?? 0);
  return Number.isFinite(time) ? time : 0;
}
