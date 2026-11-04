import { parseSnapshot, MAX_SNAPSHOT_BYTES, type MercuryAccount, type MercuryReturn, type MercurySnapshot, type MercuryTransaction } from "./model";

export type MercuryErrorCode = "network" | "auth" | "rateLimit" | "upstream" | "invalid" | "size" | "pagination" | "currency" | "storage" | "configure" | "token" | "cancelled";
export class MercuryError extends Error {
  constructor(public readonly code: MercuryErrorCode, public readonly retryAt = 0) { super(code); }
}
export type MercuryRequest = { method: "GET"; credentials: "omit"; redirect: "error"; signal: AbortSignal; headers: Record<string, string> };
export type MercuryFetch = (url: string, init: MercuryRequest) => Promise<Response>;
type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MercuryError("invalid");
  return value as Row;
}
function optionalRow(value: unknown): Row { return value == null ? {} : row(value); }
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new MercuryError("invalid");
  return value.map(row);
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 300) throw new MercuryError("invalid");
  return value;
}
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 300) : "";
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new MercuryError("invalid");
  return value;
}
const optionalNumber = (value: unknown) => value == null ? null : number(value);
function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new MercuryError("invalid");
  return value;
}
export function normalizeMercuryToken(value: string): string {
  const token = value.trim();
  // Bound the credential before putting it in SecureStore or an HTTP header.
  if (!/^[\x21-\x7e]{10,1800}$/.test(token)) throw new MercuryError("token");
  return token;
}
function account(value: Row, kind: MercuryAccount["kind"]): MercuryAccount {
  if (value.currency != null && value.currency !== "USD") throw new MercuryError("currency");
  return { id: id(value.id), name: text(value.nickname || value.name) || `Mercury ${kind}`, kind,
    status: text(value.status), currency: "USD", balance: number(value.currentBalance), available: optionalNumber(value.availableBalance),
    last4: typeof value.accountNumber === "string" ? value.accountNumber.replace(/\D/g, "").slice(-4) : "" };
}
function transaction(value: Row, surface: MercuryTransaction["surface"], categories: Map<string, string>): MercuryTransaction {
  const at = timestamp(value.postedAt || value.createdAt || value.canonicalDay);
  const category = optionalRow(value.categoryData);
  const custom = optionalRow(category.customCategory);
  const merchant = optionalRow(value.merchant);
  const treasuryType = text(value.type);
  const treasuryStatus = /cancel/i.test(treasuryType) ? "cancelled" : /fail/i.test(treasuryType) ? "failed" : /return|revert/i.test(treasuryType) ? "reversed" : "sent";
  return { id: `${surface}:${id(value.id)}`, accountId: id(value.accountId), surface, amount: number(value.amount), currency: "USD", at, date: at.slice(0, 10),
    title: text(value.counterpartyName || value.bankDescription || value.description || value.externalMemo) || "Mercury",
    status: text(value.status) || (surface === "treasury" ? treasuryStatus : "sent"),
    category: text(custom.name || category.name || categories.get(String(category.id)) || category.mercuryCategory || value.mercuryCategory || merchant.mercuryCategory) };
}
function retryAfter(value: string | null, now: number) {
  if (value && /^\d+(\.\d+)?$/.test(value)) {
    const at = now + Math.max(60000, Number(value) * 1000);
    if (Number.isFinite(at) && at < 8.64e15) return at;
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 5 * 60000;
}

export async function fetchMercurySnapshot(tokenInput: string, fetchImpl: MercuryFetch, signal?: AbortSignal, now = Date.now): Promise<MercurySnapshot> {
  const token = normalizeMercuryToken(tokenInput);
  let totalBytes = 0;
  async function get(path: string, query: Record<string, string | number> = {}): Promise<Row> {
    if (signal?.aborted) throw new MercuryError("cancelled");
    const url = new URL(`https://api.mercury.com/api/v1${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const request = new AbortController();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 30000);
    try {
      const response = await fetchImpl(url.href, { method: "GET", credentials: "omit", redirect: "error", signal: request.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? "auth" : response.status === 429 ? "rateLimit" : "upstream";
        throw new MercuryError(code, code === "rateLimit" ? retryAfter(response.headers.get("retry-after"), now()) : 0);
      }
      if (response.url && new URL(response.url).origin !== url.origin) throw new MercuryError("network");
      if (Number(response.headers.get("content-length") || 0) > MAX_SNAPSHOT_BYTES) throw new MercuryError("size");
      const reader = response.body?.getReader();
      if (!reader) throw new MercuryError("invalid");
      const decoder = new TextDecoder(); let bytes = 0; let json = "";
      try {
        while (true) {
          const part = await reader.read();
          if (signal?.aborted) throw new MercuryError("cancelled");
          if (part.done) break;
          bytes += part.value.byteLength; totalBytes += part.value.byteLength;
          if (bytes > MAX_SNAPSHOT_BYTES || totalBytes > 64 * 1024 * 1024) throw new MercuryError("size");
          json += decoder.decode(part.value, { stream: true });
        }
        json += decoder.decode();
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      return row(JSON.parse(json));
    } catch (error) {
      request.abort();
      if (signal?.aborted) throw new MercuryError("cancelled");
      if (error instanceof MercuryError) throw error;
      // Never expose response bodies, URLs, authorization headers or provider errors.
      throw new MercuryError(error instanceof SyntaxError ? "invalid" : "network");
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  }
  async function pages<T extends { id: string }>(path: string, key: string, map: (value: Row) => T, treasury = false): Promise<T[]> {
    const values = new Map<string, T>(); const seen = new Set<string>(); let cursor: string | number | null = null;
    let count = 0;
    for (let page = 0; page < 2000; page++) {
      const query: Record<string, string | number> = { limit: treasury ? 100 : 1000, order: "asc" };
      if (cursor !== null) query[treasury ? "cursor" : "start_after"] = cursor;
      const payload = await get(path, query); const items = rows(payload[key]);
      count += items.length;
      if (count > 100000) throw new MercuryError("size");
      for (const value of items) { const item = map(value); values.set(item.id, item); }
      const next = treasury ? payload.cursor : row(payload.page).nextPage;
      if (next == null || next === "") return [...values.values()];
      if (!items.length || (treasury ? typeof next !== "number" || !Number.isSafeInteger(next) || next < 0 : typeof next !== "string" || !next || next.length > 300) || seen.has(String(next))) throw new MercuryError("pagination");
      cursor = next as string | number; seen.add(String(cursor));
    }
    throw new MercuryError("pagination");
  }
  const organization = row((await get("/organization")).organization);
  const owner = `mercury:${id(organization.id)}`;
  const accounts = await pages("/accounts", "accounts", value => account(value, "depository"));
  const credit = rows((await get("/credit")).accounts).map(value => account(value, "credit"));
  const treasury = await pages("/treasury", "accounts", value => {
    const normalized = account(value, "treasury");
    const returns: MercuryReturn[] = rows(value.netReturns).map(item => {
      const month = timestamp(item.month).slice(0, 7);
      return { id: `${normalized.id}:${month}`, accountId: normalized.id, month, netAmount: number(item.netAmount), fee: number(item.treasuryFee), status: text(item.status) };
    });
    return { id: normalized.id, account: normalized, returns };
  });
  const categories = new Map((await pages("/categories", "categories", value => ({ id: id(value.id), name: text(value.name) }))).map(value => [value.id, value.name]));
  const transactions = await pages("/transactions", "transactions", value => transaction(value, "depository", categories));
  for (const entry of treasury) transactions.push(...await pages(`/treasury/${encodeURIComponent(entry.id)}/transactions`, "transactions", value => transaction({ ...value, accountId: entry.id }, "treasury", categories), true));
  if (signal?.aborted) throw new MercuryError("cancelled");
  const data: MercurySnapshot = { version: 1, provider: "mercury", mode: "live", owner, syncedAt: new Date(now()).toISOString(),
    accounts: [...accounts, ...credit, ...treasury.map(value => value.account)], transactions: transactions.sort((a, b) => b.at.localeCompare(a.at)),
    returns: treasury.flatMap(value => value.returns).sort((a, b) => b.month.localeCompare(a.month)) };
  try { return parseSnapshot(JSON.stringify(data), "mercury") as MercurySnapshot; }
  catch (error) { throw new MercuryError(error instanceof Error && error.message === "size" ? "size" : "invalid"); }
}
