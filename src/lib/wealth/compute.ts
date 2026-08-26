import { roundMoney } from "@/lib/wealth/money";
import { GOAL_SCOPE_LABEL, type WealthAccount, type WealthAsset, type WealthGoal, type WealthQuote, type WealthRange, type WealthTx } from "@/lib/wealth/types";

export type AssetPosition = {
  asset: WealthAsset;
  value: number;
  pnl: number;
  pnlPct: number | null;
};

export type ChartPoint = { at: number; value: number };

const DAY_MS = 86_400_000;
const TEN_MIN_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * HOUR_MS;

const RANGE_MS: Record<Exclude<WealthRange, "max">, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

export function cashTotal(accounts: WealthAccount[], txs: WealthTx[]): number {
  let sum = 0;
  for (const account of accounts) {
    if (account.archived) continue;
    sum += accountBalance(account.id, txs);
  }
  return roundMoney(sum);
}

export function accountBalance(accountId: string, txs: WealthTx[]): number {
  let balance = 0;
  for (const tx of txs) {
    if (tx.kind === "income" && tx.accountId === accountId) balance += tx.amount;
    else if (tx.kind === "expense" && tx.accountId === accountId) balance -= tx.amount;
    else if (tx.kind === "buy" && tx.accountId === accountId) balance -= tx.amount;
    else if (tx.kind === "sell" && tx.accountId === accountId) balance += tx.amount;
    else if (tx.kind === "transfer") {
      if (tx.accountId === accountId) balance -= tx.amount;
      if (tx.counterAccountId === accountId) balance += tx.amount;
    }
  }
  return roundMoney(balance);
}

export function assetQty(asset: WealthAsset): number {
  if (asset.quantity > 0.00000001) return asset.quantity;
  return asset.price > 0.004 ? 1 : 0;
}

export function assetValue(asset: WealthAsset): number {
  return roundMoney(assetQty(asset) * asset.price);
}

export function assetPosition(asset: WealthAsset): AssetPosition {
  const value = assetValue(asset);
  const pnl = roundMoney(value - asset.costBasis);
  const pnlPct = asset.costBasis > 0.004 ? (pnl / asset.costBasis) * 100 : value > 0 ? 100 : null;
  return { asset, value, pnl, pnlPct };
}

export function holdingsValue(assets: WealthAsset[]): number {
  return roundMoney(
    assets.filter((asset) => !asset.archived).reduce((sum, asset) => sum + assetValue(asset), 0),
  );
}

export function accountHoldings(assets: WealthAsset[], accountId: string): number {
  return roundMoney(
    assets
      .filter((asset) => !asset.archived && asset.accountId === accountId)
      .reduce((sum, asset) => sum + assetValue(asset), 0),
  );
}

export function accountTotal(accountId: string, assets: WealthAsset[], txs: WealthTx[]): number {
  return roundMoney(accountBalance(accountId, txs) + accountHoldings(assets, accountId));
}

export function netWorth(accounts: WealthAccount[], assets: WealthAsset[], txs: WealthTx[]): number {
  return roundMoney(cashTotal(accounts, txs) + holdingsValue(assets));
}

type PriceMark = { at: number; created: number; price: number };

function addMark(map: Map<string, PriceMark[]>, assetId: string, at: number, created: number, price: number) {
  if (!(price > 0.00000001)) return;
  const list = map.get(assetId) ?? [];
  list.push({ at, created, price });
  map.set(assetId, list);
}

export function priceMarks(
  assets: WealthAsset[],
  quotes: WealthQuote[],
  txs: WealthTx[],
): Map<string, PriceMark[]> {
  const map = new Map<string, PriceMark[]>();
  for (const quote of quotes) addMark(map, quote.assetId, quote.bookedAt, quote.createdAt, quote.price);
  for (const tx of txs) {
    if ((tx.kind === "buy" || tx.kind === "sell") && tx.assetId && tx.unitPrice != null) {
      addMark(map, tx.assetId, tx.bookedAt, tx.createdAt, tx.unitPrice);
    }
  }
  for (const asset of assets) {
    if (asset.archived || !(asset.price > 0.00000001)) continue;
    if (!map.has(asset.id)) addMark(map, asset.id, asset.createdAt, asset.createdAt, asset.price);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.at - b.at || a.created - b.created);
  }
  return map;
}

export function priceAtMarks(marks: PriceMark[] | undefined, at: number, fallback: number): number {
  if (!marks?.length) return fallback;
  let price = marks[0]!.price;
  for (const mark of marks) {
    if (mark.at > at) break;
    price = mark.price;
  }
  return price;
}

export function assetQtyAt(asset: WealthAsset, txs: WealthTx[], at: number): number {
  let qty = asset.quantity;
  for (const tx of txs) {
    if (tx.assetId !== asset.id || tx.bookedAt <= at || tx.quantity == null) continue;
    if (tx.kind === "buy") qty -= tx.quantity;
    if (tx.kind === "sell") qty += tx.quantity;
  }
  return Math.max(0, qty);
}

function holdingsAtTime(
  assets: WealthAsset[],
  txs: WealthTx[],
  marks: Map<string, PriceMark[]>,
  at: number,
): number {
  let sum = 0;
  for (const asset of assets) {
    if (asset.archived) continue;
    const qty = assetQtyAt(asset, txs, at);
    if (qty <= 0.00000001) continue;
    sum += qty * priceAtMarks(marks.get(asset.id), at, asset.price);
  }
  return roundMoney(sum);
}

export type AssetHistoryItem = {
  id: string;
  kind: "quote" | "buy" | "sell";
  at: number;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  value: number;
  tx?: WealthTx;
  quote?: WealthQuote;
};

export function assetHistory(
  asset: WealthAsset,
  quotes: WealthQuote[],
  txs: WealthTx[],
): AssetHistoryItem[] {
  const relatedQuotes = quotes.filter((item) => item.assetId === asset.id);
  const relatedTxs = txs.filter(
    (tx) => tx.assetId === asset.id && (tx.kind === "buy" || tx.kind === "sell"),
  );
  const marks = priceMarks([asset], relatedQuotes, relatedTxs);
  const items: AssetHistoryItem[] = [];
  for (const quote of relatedQuotes) {
    const qty = assetQtyAt(asset, relatedTxs, quote.bookedAt);
    items.push({
      id: quote.id,
      kind: "quote",
      at: quote.bookedAt,
      price: quote.price,
      quantity: qty,
      amount: null,
      value: roundMoney(qty * quote.price),
      quote,
    });
  }
  for (const tx of relatedTxs) {
    const qty = assetQtyAt(asset, relatedTxs, tx.bookedAt);
    const price = tx.unitPrice ?? priceAtMarks(marks.get(asset.id), tx.bookedAt, asset.price);
    items.push({
      id: tx.id,
      kind: tx.kind === "sell" ? "sell" : "buy",
      at: tx.bookedAt,
      price,
      quantity: tx.quantity,
      amount: tx.amount,
      value: roundMoney(qty * price),
      tx,
    });
  }
  return items.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
}

export function assetSeries(
  asset: WealthAsset,
  quotes: WealthQuote[],
  txs: WealthTx[],
  range: WealthRange,
  now = Date.now(),
): ChartPoint[] {
  const relatedQuotes = quotes.filter((item) => item.assetId === asset.id);
  const relatedTxs = txs.filter(
    (tx) => tx.assetId === asset.id && (tx.kind === "buy" || tx.kind === "sell"),
  );
  const marks = priceMarks([asset], relatedQuotes, relatedTxs);
  const windowStart = rangeStart(range, now);
  const times = new Set<number>([now]);
  for (const quote of relatedQuotes) times.add(quote.bookedAt);
  for (const tx of relatedTxs) times.add(tx.bookedAt);
  if (asset.createdAt) times.add(asset.createdAt);
  const stamps = [...times].filter((at) => at >= windowStart || at === now).sort((a, b) => a - b);
  if (!stamps.length) return [{ at: now - 60_000, value: assetValue(asset) }, { at: now, value: assetValue(asset) }];
  const points: ChartPoint[] = stamps.map((at) => {
    const qty = assetQtyAt(asset, relatedTxs, at);
    const price = priceAtMarks(marks.get(asset.id), at, asset.price);
    return { at, value: roundMoney(Math.max(0, qty) * price) };
  });
  if (points[0] && points[0].at > windowStart && range === "max") {
    points.unshift({ at: Math.max(0, points[0].at - originLeadMs(points[0].at, now)), value: points[0].value });
  }
  const last = points[points.length - 1];
  const current = assetValue(asset);
  if (!last || last.at !== now) points.push({ at: now, value: current });
  else points[points.length - 1] = { at: now, value: current };
  if (points.length < 2) points.unshift({ at: now - 60_000, value: points[0]?.value ?? 0 });
  return sampleChartPoints(points, range, points[0]!.at, now);
}

export function parseBookedDay(raw: string, now = Date.now()): number | null {
  const value = raw.trim().toLowerCase();
  if (!value || value === "hoy") return now;
  if (value === "ayer") return now - DAY_MS;
  const match = value.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  let year = match[3] ? Number(match[3]) : new Date(now).getFullYear();
  if (year < 100) year += 2000;
  const date = new Date(year, month, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date.getTime();
}

export function rangeStart(range: WealthRange, now = Date.now()): number {
  if (range === "max") return 0;
  return now - RANGE_MS[range];
}

function originLeadMs(firstAt: number, now: number): number {
  const span = Math.max(now - firstAt, 60_000);
  return Math.min(Math.max(span * 0.06, 60_000), 36 * HOUR_MS);
}

export function chartSeries(
  accounts: WealthAccount[],
  assets: WealthAsset[],
  txs: WealthTx[],
  range: WealthRange,
  quotes: WealthQuote[] = [],
  now = Date.now(),
): ChartPoint[] {
  const windowStart = rangeStart(range, now);
  const marks = priceMarks(assets, quotes, txs);
  const ordered = [...txs].sort((a, b) => a.bookedAt - b.bookedAt || a.createdAt - b.createdAt);
  const firstTx = ordered[0]?.bookedAt;
  const firstQuote = quotes.reduce((min, item) => Math.min(min, item.bookedAt), Number.POSITIVE_INFINITY);
  const firstAt = Math.min(firstTx ?? Number.POSITIVE_INFINITY, firstQuote);
  const current = netWorth(accounts, assets, txs);
  if (!Number.isFinite(firstAt)) {
    return [
      { at: now - 60_000, value: 0 },
      { at: now, value: current },
    ];
  }

  const start = Math.max(windowStart, firstAt);
  const times = new Set<number>();
  for (const tx of ordered) {
    if (tx.bookedAt >= start && tx.bookedAt <= now) times.add(tx.bookedAt);
  }
  for (const quote of quotes) {
    if (quote.bookedAt >= start && quote.bookedAt <= now) times.add(quote.bookedAt);
  }
  const stamps = [...times].sort((a, b) => a - b);

  let cash = 0;
  for (const tx of ordered) {
    if (tx.bookedAt >= start) break;
    cash = applyCash(cash, tx);
  }
  const openValue = roundMoney(cash + holdingsAtTime(assets, txs, marks, start));
  const events: ChartPoint[] = [];
  let txIndex = 0;
  while (txIndex < ordered.length && ordered[txIndex]!.bookedAt < start) txIndex += 1;
  for (const at of stamps) {
    while (txIndex < ordered.length && ordered[txIndex]!.bookedAt <= at) {
      cash = applyCash(cash, ordered[txIndex]!);
      txIndex += 1;
    }
    events.push({ at, value: roundMoney(cash + holdingsAtTime(assets, txs, marks, at)) });
  }

  const points: ChartPoint[] = [];
  if (firstAt >= windowStart) {
    points.push({ at: firstAt - originLeadMs(firstAt, now), value: 0 });
  } else {
    points.push({ at: start, value: openValue });
  }
  points.push(...events);
  const last = points[points.length - 1];
  if (!last || last.at !== now) points.push({ at: now, value: current });
  else points[points.length - 1] = { at: now, value: current };

  return sampleChartPoints(points, range, points[0]!.at, now);
}

export function visualChartRange(start: number, now: number): WealthRange {
  const span = Math.max(0, now - start);
  if (span <= DAY_MS * 1.2) return "1d";
  if (span <= DAY_MS * 8) return "1w";
  if (span <= DAY_MS * 40) return "1m";
  if (span <= DAY_MS * 400) return "1y";
  return "max";
}

export function chartStepMs(_range: WealthRange, start: number, now: number): number {
  const view = visualChartRange(start, now);
  if (view === "1d") return TEN_MIN_MS;
  if (view === "1w") return HOUR_MS;
  if (view === "1m") return FOUR_HOURS_MS;
  if (view === "1y") return DAY_MS;
  const days = Math.max(DAY_MS, now - start) / DAY_MS;
  if (days <= 365 * 3) return 7 * DAY_MS;
  return 14 * DAY_MS;
}

function startOfLocalDay(ts: number): number {
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

export function alignChartTime(ts: number, _range: WealthRange, stepMs: number): number {
  const date = new Date(ts);
  date.setSeconds(0, 0);
  if (stepMs <= TEN_MIN_MS) {
    date.setMinutes(Math.floor(date.getMinutes() / 10) * 10);
    return date.getTime();
  }
  if (stepMs <= HOUR_MS) {
    date.setMinutes(0);
    return date.getTime();
  }
  if (stepMs <= FOUR_HOURS_MS) {
    date.setMinutes(0);
    date.setHours(Math.floor(date.getHours() / 4) * 4);
    return date.getTime();
  }
  const day = startOfLocalDay(ts);
  const group = Math.max(1, Math.round(stepMs / DAY_MS));
  if (group <= 1) return day;
  const utcDays = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
  const aligned = Math.floor(utcDays / group) * group;
  const origin = new Date(aligned * DAY_MS);
  return new Date(origin.getUTCFullYear(), origin.getUTCMonth(), origin.getUTCDate()).getTime();
}

function nextChartTime(ts: number, stepMs: number): number {
  if (stepMs < DAY_MS) return ts + stepMs;
  const days = Math.max(1, Math.round(stepMs / DAY_MS));
  const date = new Date(ts);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function sampleChartPoints(
  events: ChartPoint[],
  range: WealthRange,
  start: number,
  now: number,
): ChartPoint[] {
  if (!events.length) return [{ at: start || now - 1, value: 0 }, { at: now, value: 0 }];
  const step = chartStepMs(range, start, now);
  const times = new Set<number>([start, now]);
  for (const event of events) {
    if (event.at >= start && event.at <= now) times.add(event.at);
  }
  let t = alignChartTime(start, range, step);
  if (t < start) t = start;
  while (t < now) {
    times.add(t);
    const next = nextChartTime(t, step);
    if (next <= t) break;
    t = next;
  }
  const stamps = [...times].sort((a, b) => a - b);
  const sampled: ChartPoint[] = [];
  let i = 0;
  let value = events[0]!.value;
  for (const at of stamps) {
    while (i < events.length && events[i]!.at <= at) {
      value = events[i]!.value;
      i += 1;
    }
    sampled.push({ at, value });
  }
  if (sampled.length < 2) sampled.unshift({ at: now - 1, value: sampled[0]?.value ?? 0 });
  return sampled;
}

export function formatChartScrub(at: number, range: WealthRange): string {
  const date = new Date(at);
  if (range === "1d") {
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1w") {
    const day = date.toLocaleDateString("es-ES", { weekday: "short" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} ${time}`;
  }
  if (range === "1m") {
    const day = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }
  if (range === "1y") {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function changePct(points: ChartPoint[]): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!.value;
  const firstLive = points.find((point) => Math.abs(point.value) >= 0.005);
  const first = firstLive?.value ?? points[0]!.value;
  if (Math.abs(first) < 0.005) return 0;
  return ((last - first) / Math.abs(first)) * 100;
}

function applyCash(cash: number, tx: WealthTx): number {
  if (tx.kind === "income" || tx.kind === "sell") return cash + tx.amount;
  if (tx.kind === "expense" || tx.kind === "buy") return cash - tx.amount;
  return cash;
}

const MONTH_MS = 30.4375 * DAY_MS;
const PACE_LOOKBACK_MS = 90 * DAY_MS;

export type GoalProgress = {
  goal: WealthGoal;
  current: number;
  remaining: number;
  pct: number;
  reached: boolean;
  pacePerMonth: number | null;
  etaAt: number | null;
  onTrack: boolean | null;
  scopeLabel: string;
};

export function goalCurrent(
  goal: WealthGoal,
  accounts: WealthAccount[],
  assets: WealthAsset[],
  txs: WealthTx[],
  at = Date.now(),
): number {
  const sliced = txs.filter((tx) => tx.bookedAt <= at);
  if (goal.scope === "cash") return cashTotal(accounts, sliced);
  if (goal.scope === "account" && goal.accountId) return accountTotal(goal.accountId, assets, sliced);
  if (goal.scope === "asset" && goal.assetId) {
    const asset = assets.find((item) => item.id === goal.assetId);
    if (!asset) return 0;
    return roundMoney(assetQtyAt(asset, txs, at) * asset.price);
  }
  const qty = new Map<string, number>();
  for (const asset of assets) {
    if (asset.archived) continue;
    qty.set(asset.id, assetQtyAt(asset, txs, at));
  }
  let invested = 0;
  for (const asset of assets) {
    if (asset.archived) continue;
    invested += (qty.get(asset.id) ?? 0) * asset.price;
  }
  return roundMoney(cashTotal(accounts, sliced) + invested);
}

export function goalProgress(
  goal: WealthGoal,
  accounts: WealthAccount[],
  assets: WealthAsset[],
  txs: WealthTx[],
  now = Date.now(),
): GoalProgress {
  const current = goalCurrent(goal, accounts, assets, txs, now);
  const remaining = roundMoney(Math.max(0, goal.target - current));
  const reached = current + 0.004 >= goal.target;
  const pct = goal.target > 0.004 ? Math.min(1, Math.max(0, current / goal.target)) : reached ? 1 : 0;
  const lookback = now - PACE_LOOKBACK_MS;
  const oldest = txs.reduce((min, tx) => Math.min(min, tx.bookedAt), now);
  const from = Math.max(lookback, Math.min(oldest, now - 14 * DAY_MS));
  const span = now - from;
  let pacePerMonth: number | null = null;
  if (span >= 14 * DAY_MS) {
    const past = goalCurrent(goal, accounts, assets, txs, from);
    pacePerMonth = roundMoney(((current - past) / span) * MONTH_MS);
  }
  let etaAt: number | null = null;
  if (!reached && pacePerMonth != null && pacePerMonth > 0.5) {
    etaAt = now + (remaining / pacePerMonth) * MONTH_MS;
  }
  let onTrack: boolean | null = null;
  if (goal.deadlineAt != null && !reached) {
    onTrack = etaAt != null ? etaAt <= goal.deadlineAt : goal.deadlineAt >= now;
  }
  const scopeLabel = goalScopeLabel(goal, accounts, assets);
  return { goal, current, remaining, pct, reached, pacePerMonth, etaAt, onTrack, scopeLabel };
}

export function goalScopeLabel(
  goal: WealthGoal,
  accounts: WealthAccount[],
  assets: WealthAsset[],
): string {
  if (goal.scope === "account") {
    return accounts.find((item) => item.id === goal.accountId)?.name ?? GOAL_SCOPE_LABEL.account;
  }
  if (goal.scope === "asset") {
    return assets.find((item) => item.id === goal.assetId)?.name ?? GOAL_SCOPE_LABEL.asset;
  }
  return GOAL_SCOPE_LABEL[goal.scope];
}

export function formatGoalEta(progress: GoalProgress, now = Date.now()): string {
  if (progress.reached) return "Objetivo alcanzado";
  const parts: string[] = [];
  if (progress.etaAt) parts.push(`A este ritmo, ${formatHorizon(progress.etaAt, now)}`);
  else if (progress.pacePerMonth != null && progress.pacePerMonth <= 0.5) {
    parts.push("A este ritmo no se acerca");
  } else {
    parts.push("Aún no hay ritmo para estimar");
  }
  if (progress.goal.deadlineAt != null) {
    parts.push(formatDeadline(progress.goal.deadlineAt, now));
    if (progress.onTrack === false) parts.push("No llegas a esa fecha");
    else if (progress.onTrack) parts.push("Vas a tiempo");
  }
  return parts.join(" · ");
}

function startOfDay(ts: number): number {
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function formatHorizon(at: number, now: number): string {
  const days = Math.round((at - now) / DAY_MS);
  if (days <= 10) return "en unos días";
  if (days <= 45) {
    const weeks = Math.max(1, Math.round(days / 7));
    return weeks === 1 ? "en una semana" : `en ${weeks} semanas`;
  }
  const month = new Date(at).toLocaleDateString("es", { month: "long", year: "numeric" });
  return `hacia ${month}`;
}

function formatDeadline(at: number, now: number): string {
  const days = Math.ceil((startOfDay(at) - startOfDay(now)) / DAY_MS);
  if (days < 0) return "La fecha ya pasó";
  if (days === 0) return "Fecha: hoy";
  if (days === 1) return "Fecha: mañana";
  if (days < 45) return `Quedan ${days} días`;
  return `Para ${new Date(at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function sortGoalProgress(items: GoalProgress[]): GoalProgress[] {
  return [...items].sort((a, b) => {
    if (a.reached !== b.reached) return a.reached ? 1 : -1;
    if (a.goal.deadlineAt != null && b.goal.deadlineAt != null) return a.goal.deadlineAt - b.goal.deadlineAt;
    if (a.goal.deadlineAt != null) return -1;
    if (b.goal.deadlineAt != null) return 1;
    return b.pct - a.pct;
  });
}
