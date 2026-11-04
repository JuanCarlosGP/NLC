export type Provider = "whoop" | "mercury";
export type Mode = "live" | "demo";
type Base = { version: 1; mode: Mode; syncedAt: string; owner: string };
export type WhoopDay = { id: string; date: string; strain: number | null; calories: number | null; recovery: number | null; restingHeartRate: number | null; hrv: number | null; spo2: number | null; temperature: number | null; sleepId: string | null };
export type WhoopSleep = { id: string; date: string; start: string; end: string | null; nap: boolean; performance: number | null; efficiency: number | null; respiratoryRate: number | null; lightMinutes: number | null; deepMinutes: number | null; remMinutes: number | null; awakeMinutes: number | null; asleepMinutes: number | null };
export type WhoopActivity = { id: string; date: string; start: string; end: string | null; name: string; strain: number | null; calories: number | null; averageHeartRate: number | null; maxHeartRate: number | null; distanceMeters: number | null; zoneMinutes: (number | null)[] };
export type WhoopSnapshot = Base & { provider: "whoop"; name: string; body: { weightKg: number | null; heightMeters: number | null; maxHeartRate: number | null }; days: WhoopDay[]; sleeps: WhoopSleep[]; activities: WhoopActivity[] };
export type MercuryAccount = { id: string; name: string; kind: "depository" | "credit" | "treasury"; status: string; currency: "USD"; balance: number; available: number | null; last4: string };
export type MercuryTransaction = { id: string; accountId: string; surface: "depository" | "treasury"; amount: number; currency: "USD"; date: string; at: string; title: string; status: string; category: string };
export type MercuryReturn = { id: string; accountId: string; month: string; netAmount: number; fee: number; status: string };
export type MercurySnapshot = Base & { provider: "mercury"; accounts: MercuryAccount[]; transactions: MercuryTransaction[]; returns: MercuryReturn[] };
export type Snapshot = WhoopSnapshot | MercurySnapshot;
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
export function isProvider(value: unknown): value is Provider { return value === "whoop" || value === "mercury"; }
function fail(): never { throw new Error("invalid"); }
type Check = (value: unknown) => boolean;
const str: Check = value => typeof value === "string" && value.length <= 300;
const identifier: Check = value => typeof value === "string" && value.length > 0 && value.length <= 10000;
const num: Check = value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
const nullable = (check: Check): Check => value => value === null || check(value);
const choice = (...values: unknown[]): Check => value => values.includes(value);
const timestamp: Check = value => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const day: Check = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
const optionalNum = nullable(num);
const obj = (schema: Record<string, Check>): Check => value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === Object.keys(schema).length && Object.entries(schema).every(([key, check]) => Object.hasOwn(row, key) && check(row[key]));
};
const rows = (check: Check): Check => value => Array.isArray(value) && value.length <= 100000 && value.every(check) && new Set(value.map(row => row.id)).size === value.length;
const base = { version: choice(1), mode: choice("demo", "live"), syncedAt: timestamp, owner: identifier };
const whoop = obj({ ...base, provider: choice("whoop"), name: str,
  body: obj({ weightKg: optionalNum, heightMeters: optionalNum, maxHeartRate: optionalNum }),
  days: rows(obj({ id: identifier, date: day, strain: optionalNum, calories: optionalNum, recovery: optionalNum, restingHeartRate: optionalNum, hrv: optionalNum, spo2: optionalNum, temperature: optionalNum, sleepId: nullable(identifier) })),
  sleeps: rows(obj({ id: identifier, date: day, start: timestamp, end: nullable(timestamp), nap: choice(true,false), performance: optionalNum, efficiency: optionalNum, respiratoryRate: optionalNum, lightMinutes: optionalNum, deepMinutes: optionalNum, remMinutes: optionalNum, awakeMinutes: optionalNum, asleepMinutes: optionalNum })),
  activities: rows(obj({ id: identifier, date: day, start: timestamp, end: nullable(timestamp), name: str, strain: optionalNum, calories: optionalNum, averageHeartRate: optionalNum, maxHeartRate: optionalNum, distanceMeters: optionalNum, zoneMinutes: value => Array.isArray(value) && value.length === 6 && value.every(optionalNum) })),
});
const mercury = obj({ ...base, provider: choice("mercury"),
  accounts: rows(obj({ id: identifier, name: str, kind: choice("depository","credit","treasury"), status: str, currency: choice("USD"), balance: num, available: optionalNum, last4: value => typeof value === "string" && /^(\d{4})?$/.test(value) })),
  transactions: rows(obj({ id: identifier, accountId: identifier, surface: choice("depository","treasury"), amount: num, currency: choice("USD"), date: day, at: timestamp, title: str, status: str, category: str })),
  returns: rows(obj({ id: identifier, accountId: identifier, month: value => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value), netAmount: num, fee: num, status: str })),
});
export function validateSnapshot(value: unknown, provider?: Provider): Snapshot {
  try {
    const data = value as Snapshot;
    if (!data || (provider && data.provider !== provider) || !(data.provider === "whoop" ? whoop(data) : mercury(data))) fail();
    if (data.provider === "whoop") {
      const sleeps = new Set(data.sleeps.map(row => row.id));
      if (data.days.some(row => row.sleepId !== null && !sleeps.has(row.sleepId))) fail();
    } else {
      const accounts = new Set(data.accounts.map(row => row.id));
      if (data.transactions.some(row => !accounts.has(row.accountId)) || data.returns.some(row => !accounts.has(row.accountId))) fail();
    }
    return data;
  } catch { return fail(); }
}
export function parseSnapshot(text: string, provider?: Provider): Snapshot {
  if (text.length > MAX_SNAPSHOT_BYTES || new TextEncoder().encode(text).length > MAX_SNAPSHOT_BYTES) throw new Error("size");
  try { return validateSnapshot(JSON.parse(text), provider); } catch { throw new Error("invalid"); }
}
export function mercuryBalances(data: MercurySnapshot) {
  const active = data.accounts.filter(row => !["deleted","archived","closed"].includes(row.status));
  const total = (rows: MercuryAccount[]) => rows.reduce((sum,row) => sum + Math.round(row.balance * 100),0) / 100;
  return { assets: total(active.filter(row => row.kind !== "credit")), credit: total(active.filter(row => row.kind === "credit")), total: total(active) };
}
export function activityMinutes(row: WhoopActivity) { return row.end ? Math.max(0, (Date.parse(row.end) - Date.parse(row.start)) / 60000) : null; }
