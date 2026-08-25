import { roundMoney } from "@/lib/wealth/money";
import { GOAL_SCOPE_LABEL, type WealthAccount, type WealthAsset, type WealthGoal, type WealthRange, type WealthTx } from "@/lib/wealth/types";

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

export function assetValue(asset: WealthAsset): number {
  return roundMoney(asset.quantity * asset.price);
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

export function netWorth(accounts: WealthAccount[], assets: WealthAsset[], txs: WealthTx[]): number {
  return roundMoney(cashTotal(accounts, txs) + holdingsValue(assets));
}

export function rangeStart(range: WealthRange, now = Date.now()): number {
  if (range === "max") return 0;
  return now - RANGE_MS[range];
}

export function chartSeries(
  accounts: WealthAccount[],
  assets: WealthAsset[],
  txs: WealthTx[],
  range: WealthRange,
  now = Date.now(),
): ChartPoint[] {
  const start = rangeStart(range, now);
  const prices = new Map(assets.map((asset) => [asset.id, asset.price]));
  const qty = new Map<string, number>();
  let cash = 0;
  const points: ChartPoint[] = [{ at: start || (txs[0]?.bookedAt ?? now), value: 0 }];

  const ordered = [...txs].sort((a, b) => a.bookedAt - b.bookedAt || a.createdAt - b.createdAt);
  for (const tx of ordered) {
    cash = applyCash(cash, tx);
    applyQty(qty, tx);
    const holdings = holdingsAt(qty, prices);
    const value = roundMoney(cash + holdings);
    if (tx.bookedAt >= start) points.push({ at: tx.bookedAt, value });
    else points[0] = { at: start, value };
  }

  const current = netWorth(accounts, assets, txs);
  points.push({ at: now, value: current });
  if (points.length === 1) points.unshift({ at: now - 1, value: points[0]!.value });
  return sampleChartPoints(points, range, points[0]!.at, now);
}

export function chartStepMs(range: WealthRange, start: number, now: number): number {
  if (range === "1d") return TEN_MIN_MS;
  if (range === "1w") return HOUR_MS;
  if (range === "1m") return FOUR_HOURS_MS;
  if (range === "1y") return DAY_MS;
  const span = Math.max(DAY_MS, now - start);
  const days = span / DAY_MS;
  if (days <= 90) return DAY_MS;
  if (days <= 365) return 3 * DAY_MS;
  if (days <= 365 * 3) return 7 * DAY_MS;
  return 14 * DAY_MS;
}

function startOfLocalDay(ts: number): number {
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

export function alignChartTime(ts: number, range: WealthRange, stepMs: number): number {
  const date = new Date(ts);
  date.setSeconds(0, 0);
  if (range === "1d") {
    date.setMinutes(Math.floor(date.getMinutes() / 10) * 10);
    return date.getTime();
  }
  if (range === "1w") {
    date.setMinutes(0);
    return date.getTime();
  }
  if (range === "1m") {
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

function nextChartTime(ts: number, range: WealthRange, stepMs: number): number {
  if (range === "1d" || range === "1w" || range === "1m") return ts + stepMs;
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
  let t = alignChartTime(start, range, step);
  const sampled: ChartPoint[] = [];
  let i = 0;
  let value = events[0]!.value;
  const push = (at: number) => {
    while (i < events.length && events[i]!.at <= at) {
      value = events[i]!.value;
      i += 1;
    }
    sampled.push({ at, value });
  };
  while (t < now) {
    push(t);
    const next = nextChartTime(t, range, step);
    if (next <= t) break;
    t = next;
  }
  push(now);
  if (sampled.length < 2) sampled.unshift({ at: now - 1, value: sampled[0]!.value });
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
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  if (Math.abs(first) < 0.005) return last > 0.005 ? 100 : last < -0.005 ? -100 : 0;
  return ((last - first) / Math.abs(first)) * 100;
}

function applyCash(cash: number, tx: WealthTx): number {
  if (tx.kind === "income" || tx.kind === "sell") return cash + tx.amount;
  if (tx.kind === "expense" || tx.kind === "buy") return cash - tx.amount;
  return cash;
}

function applyQty(qty: Map<string, number>, tx: WealthTx) {
  if (!tx.assetId || tx.quantity == null) return;
  const current = qty.get(tx.assetId) ?? 0;
  if (tx.kind === "buy") qty.set(tx.assetId, current + tx.quantity);
  if (tx.kind === "sell") qty.set(tx.assetId, current - tx.quantity);
}

function holdingsAt(qty: Map<string, number>, prices: Map<string, number>): number {
  let sum = 0;
  for (const [id, amount] of qty) {
    sum += amount * (prices.get(id) ?? 0);
  }
  return sum;
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
  if (goal.scope === "account" && goal.accountId) return accountBalance(goal.accountId, sliced);
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
  const prices = new Map(assets.map((asset) => [asset.id, asset.price]));
  return roundMoney(cashTotal(accounts, sliced) + holdingsAt(qty, prices));
}

function assetQtyAt(asset: WealthAsset, txs: WealthTx[], at: number): number {
  let qty = asset.quantity;
  for (const tx of txs) {
    if (tx.assetId !== asset.id || tx.bookedAt <= at || tx.quantity == null) continue;
    if (tx.kind === "buy") qty -= tx.quantity;
    if (tx.kind === "sell") qty += tx.quantity;
  }
  return Math.max(0, qty);
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
