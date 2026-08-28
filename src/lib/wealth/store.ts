import { getDb } from "@/lib/db/client";
import { t } from "@/lib/i18n/runtime";
import {
  CASH_ACCOUNT_ID,
  CASH_ACCOUNT_NAME,
  parseGoalScope,
  type WealthAccount,
  type WealthAccountKind,
  type WealthAsset,
  type WealthAssetKind,
  type WealthGoal,
  type WealthGoalScope,
  type WealthQuote,
  type WealthTx,
  type WealthTxKind,
} from "@/lib/wealth/types";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  created_at: number;
  archived: number;
};

type AssetRow = {
  id: string;
  name: string;
  ticker: string;
  kind: string;
  account_id: string | null;
  quantity: number;
  price: number;
  cost_basis: number;
  currency: string;
  created_at: number;
  updated_at: number;
  archived: number;
};

const ASSET_SELECT =
  "id, name, ticker, kind, account_id, quantity, price, cost_basis, currency, created_at, updated_at, archived";

type GoalRow = {
  id: string;
  name: string;
  target: number;
  scope: string;
  account_id: string | null;
  asset_id: string | null;
  deadline_at: number | null;
  created_at: number;
  updated_at: number;
  archived: number;
};

type TxRow = {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  title: string;
  category: string;
  account_id: string | null;
  asset_id: string | null;
  counter_account_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  booked_at: number;
  notes: string;
  created_at: number;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapAccount(row: AccountRow): WealthAccount {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "bank" || row.kind === "wallet" ? row.kind : "cash",
    currency: row.currency,
    createdAt: row.created_at,
    archived: Boolean(row.archived),
  };
}

function mapAsset(row: AssetRow): WealthAsset {
  const kind: WealthAssetKind =
    row.kind === "stock" ||
    row.kind === "etf" ||
    row.kind === "crypto" ||
    row.kind === "fund" ||
    row.kind === "portfolio" ? row.kind : "other";
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    kind,
    accountId: row.account_id || null,
    quantity: row.quantity,
    price: row.price,
    costBasis: row.cost_basis,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived),
  };
}

function mapTx(row: TxRow): WealthTx {
  const kind: WealthTxKind =
    row.kind === "income" ||
    row.kind === "expense" ||
    row.kind === "buy" ||
    row.kind === "sell" ||
    row.kind === "transfer"
      ? row.kind
      : "expense";
  return {
    id: row.id,
    kind,
    amount: row.amount,
    currency: row.currency,
    title: row.title,
    category: row.category,
    accountId: row.account_id,
    assetId: row.asset_id,
    counterAccountId: row.counter_account_id,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    bookedAt: row.booked_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapGoal(row: GoalRow): WealthGoal {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    scope: parseGoalScope(row.scope) ?? "networth",
    accountId: row.account_id,
    assetId: row.asset_id,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived),
  };
}

export async function ensureCashAccount(): Promise<WealthAccount> {
  const db = await getDb();
  const existing = await db.getFirstAsync<AccountRow>(
    "SELECT id, name, kind, currency, created_at, archived FROM wealth_accounts WHERE id = ?",
    CASH_ACCOUNT_ID,
  );
  if (existing) return mapAccount(existing);
  const createdAt = Date.now();
  await db.runAsync(
    "INSERT INTO wealth_accounts (id, name, kind, currency, created_at, archived) VALUES (?, ?, 'cash', 'EUR', ?, 0)",
    CASH_ACCOUNT_ID,
    CASH_ACCOUNT_NAME,
    createdAt,
  );
  return {
    id: CASH_ACCOUNT_ID,
    name: CASH_ACCOUNT_NAME,
    kind: "cash",
    currency: "EUR",
    createdAt,
    archived: false,
  };
}

export async function listAccounts(opts?: { includeArchived?: boolean }): Promise<WealthAccount[]> {
  await ensureCashAccount();
  const db = await getDb();
  const rows = opts?.includeArchived
    ? await db.getAllAsync<AccountRow>(
        "SELECT id, name, kind, currency, created_at, archived FROM wealth_accounts ORDER BY archived ASC, created_at ASC",
      )
    : await db.getAllAsync<AccountRow>(
        "SELECT id, name, kind, currency, created_at, archived FROM wealth_accounts WHERE archived = 0 ORDER BY created_at ASC",
      );
  return rows.map(mapAccount);
}

export async function createAccount(name: string, kind: WealthAccountKind = "bank"): Promise<WealthAccount> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(t("wealth.errNeedAccountName"));
  await ensureCashAccount();
  const db = await getDb();
  const id = newId("acc");
  const createdAt = Date.now();
  await db.runAsync(
    "INSERT INTO wealth_accounts (id, name, kind, currency, created_at, archived) VALUES (?, ?, ?, 'EUR', ?, 0)",
    id,
    trimmed,
    kind,
    createdAt,
  );
  return { id, name: trimmed, kind, currency: "EUR", createdAt, archived: false };
}

export async function renameAccount(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await getDb();
  await db.runAsync("UPDATE wealth_accounts SET name = ? WHERE id = ?", trimmed, id);
}

export async function archiveAccount(id: string, archived = true): Promise<void> {
  if (id === CASH_ACCOUNT_ID) return;
  const db = await getDb();
  await db.runAsync("UPDATE wealth_accounts SET archived = ? WHERE id = ?", archived ? 1 : 0, id);
}

export async function listAssets(opts?: { includeArchived?: boolean }): Promise<WealthAsset[]> {
  const db = await getDb();
  const rows = opts?.includeArchived
    ? await db.getAllAsync<AssetRow>(
        `SELECT ${ASSET_SELECT} FROM wealth_assets ORDER BY archived ASC, name ASC`,
      )
    : await db.getAllAsync<AssetRow>(
        `SELECT ${ASSET_SELECT} FROM wealth_assets WHERE archived = 0 ORDER BY name ASC`,
      );
  return rows.map(mapAsset);
}

export async function getAsset(id: string): Promise<WealthAsset | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AssetRow>(`SELECT ${ASSET_SELECT} FROM wealth_assets WHERE id = ?`, id);
  return row ? mapAsset(row) : null;
}

export async function createAsset(
  input: {
    name: string;
    ticker?: string;
    kind?: WealthAssetKind;
    accountId?: string | null;
    quantity?: number;
    price?: number;
    costBasis?: number;
  },
  opts?: { quote?: boolean },
): Promise<WealthAsset> {
  const name = input.name.trim();
  if (!name) throw new Error(t("wealth.errNeedAssetName"));
  const db = await getDb();
  const id = newId("ast");
  const now = Date.now();
  const ticker = input.ticker?.trim().toUpperCase() ?? "";
  const kind = input.kind ?? "other";
  const accountId = input.accountId || null;
  const quantity = input.quantity ?? 0;
  const price = input.price ?? 0;
  const costBasis = input.costBasis ?? quantity * price;
  await db.runAsync(
    `INSERT INTO wealth_assets (id, name, ticker, kind, account_id, quantity, price, cost_basis, currency, created_at, updated_at, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, 0)`,
    id,
    name,
    ticker,
    kind,
    accountId,
    quantity,
    price,
    costBasis,
    now,
    now,
  );
  const created: WealthAsset = {
    id,
    name,
    ticker,
    kind,
    accountId,
    quantity,
    price,
    costBasis,
    currency: "EUR",
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
  if (opts?.quote !== false && price > 0.004) {
    await insertQuote(id, price, now, now);
  }
  return created;
}

export async function updateAsset(
  id: string,
  patch: {
    name?: string;
    ticker?: string;
    kind?: WealthAssetKind;
    accountId?: string | null;
    quantity?: number;
    price?: number;
    costBasis?: number;
    archived?: boolean;
  },
  opts?: { quote?: boolean },
): Promise<void> {
  const current = await getAsset(id);
  if (!current) return;
  const db = await getDb();
  const accountId = patch.accountId !== undefined ? patch.accountId || null : current.accountId;
  const nextPrice = patch.price ?? current.price;
  await db.runAsync(
    `UPDATE wealth_assets
     SET name = ?, ticker = ?, kind = ?, account_id = ?, quantity = ?, price = ?, cost_basis = ?, archived = ?, updated_at = ?
     WHERE id = ?`,
    patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    patch.ticker !== undefined ? patch.ticker.trim().toUpperCase() : current.ticker,
    patch.kind ?? current.kind,
    accountId,
    patch.quantity ?? current.quantity,
    nextPrice,
    patch.costBasis ?? current.costBasis,
    (patch.archived ?? current.archived) ? 1 : 0,
    Date.now(),
    id,
  );
  if (opts?.quote !== false && patch.price != null && Math.abs(patch.price - current.price) > 0.0005) {
    await insertQuote(id, patch.price, Date.now());
  }
}

type QuoteRow = {
  id: string;
  asset_id: string;
  price: number;
  booked_at: number;
  created_at: number;
};

function mapQuote(row: QuoteRow): WealthQuote {
  return {
    id: row.id,
    assetId: row.asset_id,
    price: row.price,
    bookedAt: row.booked_at,
    createdAt: row.created_at,
  };
}

async function insertQuote(assetId: string, price: number, bookedAt: number, createdAt = Date.now()): Promise<WealthQuote> {
  const db = await getDb();
  const id = newId("qte");
  await db.runAsync(
    "INSERT INTO wealth_quotes (id, asset_id, price, booked_at, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    assetId,
    price,
    bookedAt,
    createdAt,
  );
  return { id, assetId, price, bookedAt, createdAt };
}

async function syncAssetPriceFromMarks(assetId: string): Promise<void> {
  const db = await getDb();
  const quote = await db.getFirstAsync<{ price: number; booked_at: number; created_at: number }>(
    "SELECT price, booked_at, created_at FROM wealth_quotes WHERE asset_id = ? ORDER BY booked_at DESC, created_at DESC LIMIT 1",
    assetId,
  );
  const tx = await db.getFirstAsync<{ unit_price: number; booked_at: number; created_at: number }>(
    `SELECT unit_price, booked_at, created_at FROM wealth_tx
     WHERE asset_id = ? AND (kind = 'buy' OR kind = 'sell') AND unit_price IS NOT NULL
     ORDER BY booked_at DESC, created_at DESC LIMIT 1`,
    assetId,
  );
  let price: number | null = null;
  if (quote && tx) {
    if (quote.booked_at !== tx.booked_at) price = quote.booked_at > tx.booked_at ? quote.price : tx.unit_price;
    else price = quote.created_at >= tx.created_at ? quote.price : tx.unit_price;
  } else if (quote) price = quote.price;
  else if (tx) price = tx.unit_price;
  if (price == null) return;
  await db.runAsync("UPDATE wealth_assets SET price = ?, updated_at = ? WHERE id = ?", price, Date.now(), assetId);
}

export async function listQuotes(assetId?: string): Promise<WealthQuote[]> {
  const db = await getDb();
  const rows = assetId
    ? await db.getAllAsync<QuoteRow>(
        "SELECT id, asset_id, price, booked_at, created_at FROM wealth_quotes WHERE asset_id = ? ORDER BY booked_at DESC, created_at DESC",
        assetId,
      )
    : await db.getAllAsync<QuoteRow>(
        "SELECT id, asset_id, price, booked_at, created_at FROM wealth_quotes ORDER BY booked_at DESC, created_at DESC",
      );
  return rows.map(mapQuote);
}

export async function createQuote(input: {
  assetId: string;
  price: number;
  bookedAt?: number;
}): Promise<WealthQuote> {
  if (!(input.price > 0)) throw new Error(t("wealth.errPricePositive"));
  const asset = await getAsset(input.assetId);
  if (!asset) throw new Error(t("wealth.errAssetNotFound"));
  const now = Date.now();
  const bookedAt = input.bookedAt ?? now;
  const quote = await insertQuote(input.assetId, input.price, bookedAt, now);
  await syncAssetPriceFromMarks(input.assetId);
  return quote;
}

export async function deleteQuote(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<QuoteRow>(
    "SELECT id, asset_id, price, booked_at, created_at FROM wealth_quotes WHERE id = ?",
    id,
  );
  if (!row) return;
  await db.runAsync("DELETE FROM wealth_quotes WHERE id = ?", id);
  await syncAssetPriceFromMarks(row.asset_id);
}

export async function listTx(): Promise<WealthTx[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TxRow>(
    `SELECT id, kind, amount, currency, title, category, account_id, asset_id, counter_account_id, quantity, unit_price, booked_at, notes, created_at
     FROM wealth_tx ORDER BY booked_at DESC, created_at DESC`,
  );
  return rows.map(mapTx);
}

export async function getTx(id: string): Promise<WealthTx | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TxRow>(
    `SELECT id, kind, amount, currency, title, category, account_id, asset_id, counter_account_id, quantity, unit_price, booked_at, notes, created_at
     FROM wealth_tx WHERE id = ?`,
    id,
  );
  return row ? mapTx(row) : null;
}

export type CreateTxInput = {
  kind: WealthTxKind;
  amount: number;
  title: string;
  category?: string;
  accountId?: string | null;
  assetId?: string | null;
  counterAccountId?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  bookedAt?: number;
  notes?: string;
  assetName?: string;
  assetTicker?: string;
  assetKind?: WealthAssetKind;
};

export async function createTx(input: CreateTxInput): Promise<WealthTx> {
  if (!(input.amount > 0)) throw new Error(t("wealth.errAmountPositive"));
  const title = input.title.trim();
  if (!title) throw new Error(t("wealth.errTxConcept"));
  await ensureCashAccount();
  const db = await getDb();
  const quantity =
    input.quantity ?? (input.kind === "buy" || input.kind === "sell" ? 1 : null);
  const unitPrice = input.unitPrice ?? (quantity ? input.amount / quantity : null);

  const assetId = await applyAssetImpact({
    kind: input.kind,
    amount: input.amount,
    quantity,
    unitPrice,
    assetId: input.assetId ?? null,
    accountId: input.accountId ?? null,
    assetName: input.assetName?.trim() || title,
    assetTicker: input.assetTicker,
    assetKind: input.assetKind,
  });

  const id = newId("wtx");
  const now = Date.now();
  const bookedAt = input.bookedAt ?? now;
  await db.runAsync(
    `INSERT INTO wealth_tx (id, kind, amount, currency, title, category, account_id, asset_id, counter_account_id, quantity, unit_price, booked_at, notes, created_at)
     VALUES (?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.kind,
    input.amount,
    title,
    input.category?.trim() ?? "",
    input.accountId ?? (input.kind === "transfer" ? null : CASH_ACCOUNT_ID),
    input.kind === "buy" || input.kind === "sell" ? assetId : null,
    input.kind === "transfer" ? input.counterAccountId ?? null : null,
    input.kind === "buy" || input.kind === "sell" ? quantity : null,
    input.kind === "buy" || input.kind === "sell" ? unitPrice : null,
    bookedAt,
    input.notes?.trim() ?? "",
    now,
  );

  const created = await getTx(id);
  if (!created) throw new Error(t("wealth.errTxSave"));
  return created;
}

async function reverseAssetImpact(tx: WealthTx): Promise<void> {
  if (!tx.assetId || tx.quantity == null) return;
  const asset = await getAsset(tx.assetId);
  if (!asset) return;
  if (tx.kind === "buy") {
    await updateAsset(
      tx.assetId,
      {
        quantity: Math.max(0, asset.quantity - tx.quantity),
        costBasis: Math.max(0, asset.costBasis - tx.amount),
      },
      { quote: false },
    );
  } else if (tx.kind === "sell") {
    await updateAsset(
      tx.assetId,
      {
        quantity: asset.quantity + tx.quantity,
        costBasis: asset.costBasis + tx.amount,
      },
      { quote: false },
    );
  }
}

async function applyAssetImpact(input: {
  kind: WealthTxKind;
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
  assetId: string | null;
  accountId?: string | null;
  assetName?: string;
  assetTicker?: string;
  assetKind?: WealthAssetKind;
}): Promise<string | null> {
  let assetId = input.assetId;
  const quantity = input.quantity;
  const unitPrice = input.unitPrice;
  if ((input.kind === "buy" || input.kind === "sell") && !assetId) {
    if (input.kind === "sell") throw new Error(t("wealth.errPickSellAsset"));
    const asset = await createAsset(
      {
        name: input.assetName?.trim() || t("wealth.assetFallback"),
        ticker: input.assetTicker,
        kind: input.assetKind,
        accountId: input.accountId,
        quantity: 0,
        price: unitPrice ?? 0,
        costBasis: 0,
      },
      { quote: false },
    );
    assetId = asset.id;
  }
  if (assetId && quantity != null) {
    const asset = await getAsset(assetId);
    if (asset) {
      if (input.kind === "buy") {
        await updateAsset(
          assetId,
          {
            quantity: asset.quantity + quantity,
            price: unitPrice ?? asset.price,
            costBasis: asset.costBasis + input.amount,
          },
          { quote: false },
        );
      } else if (input.kind === "sell") {
        const nextQty = Math.max(0, asset.quantity - quantity);
        const soldCost =
          asset.quantity > 0 ? (asset.costBasis * Math.min(quantity, asset.quantity)) / asset.quantity : 0;
        await updateAsset(
          assetId,
          {
            quantity: nextQty,
            price: unitPrice ?? asset.price,
            costBasis: Math.max(0, asset.costBasis - soldCost),
          },
          { quote: false },
        );
      }
    }
  }
  return assetId;
}

export async function updateTx(id: string, input: CreateTxInput): Promise<WealthTx> {
  const current = await getTx(id);
  if (!current) throw new Error(t("wealth.errTxNotFound"));
  if (!(input.amount > 0)) throw new Error(t("wealth.errAmountPositive"));
  const title = input.title.trim();
  if (!title) throw new Error(t("wealth.errTxConcept"));
  await reverseAssetImpact(current);
  const quantity =
    input.quantity ?? (input.kind === "buy" || input.kind === "sell" ? 1 : null);
  const unitPrice = input.unitPrice ?? (quantity ? input.amount / quantity : null);
  const assetId = await applyAssetImpact({
    kind: input.kind,
    amount: input.amount,
    quantity,
    unitPrice,
    assetId: input.assetId ?? null,
    accountId: input.accountId ?? null,
    assetName: input.assetName?.trim() || title,
    assetTicker: input.assetTicker,
    assetKind: input.assetKind,
  });
  const db = await getDb();
  await db.runAsync(
    `UPDATE wealth_tx
     SET kind = ?, amount = ?, title = ?, category = ?, account_id = ?, asset_id = ?, counter_account_id = ?,
         quantity = ?, unit_price = ?, booked_at = ?, notes = ?
     WHERE id = ?`,
    input.kind,
    input.amount,
    title,
    input.category?.trim() ?? "",
    input.accountId ?? (input.kind === "transfer" ? null : CASH_ACCOUNT_ID),
    input.kind === "buy" || input.kind === "sell" ? assetId : null,
    input.kind === "transfer" ? input.counterAccountId ?? null : null,
    input.kind === "buy" || input.kind === "sell" ? quantity : null,
    input.kind === "buy" || input.kind === "sell" ? unitPrice : null,
    input.bookedAt ?? current.bookedAt,
    input.notes?.trim() ?? current.notes,
    id,
  );
  const next = await getTx(id);
  if (!next) throw new Error(t("wealth.errTxSave"));
  return next;
}

export async function deleteTx(id: string): Promise<void> {
  const tx = await getTx(id);
  if (!tx) return;
  await reverseAssetImpact(tx);
  const db = await getDb();
  await db.runAsync("DELETE FROM wealth_tx WHERE id = ?", id);
}

export async function listGoals(opts?: { includeArchived?: boolean }): Promise<WealthGoal[]> {
  const db = await getDb();
  const rows = opts?.includeArchived
    ? await db.getAllAsync<GoalRow>(
        `SELECT id, name, target, scope, account_id, asset_id, deadline_at, created_at, updated_at, archived
         FROM wealth_goals ORDER BY archived ASC, created_at DESC`,
      )
    : await db.getAllAsync<GoalRow>(
        `SELECT id, name, target, scope, account_id, asset_id, deadline_at, created_at, updated_at, archived
         FROM wealth_goals WHERE archived = 0 ORDER BY created_at DESC`,
      );
  return rows.map(mapGoal);
}

export async function getGoal(id: string): Promise<WealthGoal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GoalRow>(
    `SELECT id, name, target, scope, account_id, asset_id, deadline_at, created_at, updated_at, archived
     FROM wealth_goals WHERE id = ?`,
    id,
  );
  return row ? mapGoal(row) : null;
}

export async function createGoal(input: {
  name: string;
  target: number;
  scope?: WealthGoalScope;
  accountId?: string | null;
  assetId?: string | null;
  deadlineAt?: number | null;
}): Promise<WealthGoal> {
  const name = input.name.trim();
  if (!name) throw new Error(t("wealth.errGoalName"));
  if (!(input.target > 0)) throw new Error(t("wealth.errGoalTargetPositive"));
  const scope = input.scope ?? "networth";
  const db = await getDb();
  const id = newId("gol");
  const now = Date.now();
  const accountId = scope === "account" ? input.accountId ?? null : null;
  const assetId = scope === "asset" ? input.assetId ?? null : null;
  const deadlineAt = input.deadlineAt ?? null;
  await db.runAsync(
    `INSERT INTO wealth_goals (id, name, target, scope, account_id, asset_id, deadline_at, created_at, updated_at, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    id,
    name,
    input.target,
    scope,
    accountId,
    assetId,
    deadlineAt,
    now,
    now,
  );
  return {
    id,
    name,
    target: input.target,
    scope,
    accountId,
    assetId,
    deadlineAt,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

export async function updateGoal(
  id: string,
  patch: {
    name?: string;
    target?: number;
    scope?: WealthGoalScope;
    accountId?: string | null;
    assetId?: string | null;
    deadlineAt?: number | null;
    archived?: boolean;
  },
): Promise<void> {
  const current = await getGoal(id);
  if (!current) return;
  const scope = patch.scope ?? current.scope;
  const db = await getDb();
  await db.runAsync(
    `UPDATE wealth_goals
     SET name = ?, target = ?, scope = ?, account_id = ?, asset_id = ?, deadline_at = ?, archived = ?, updated_at = ?
     WHERE id = ?`,
    patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    patch.target ?? current.target,
    scope,
    scope === "account" ? (patch.accountId !== undefined ? patch.accountId : current.accountId) : null,
    scope === "asset" ? (patch.assetId !== undefined ? patch.assetId : current.assetId) : null,
    patch.deadlineAt !== undefined ? patch.deadlineAt : current.deadlineAt,
    (patch.archived ?? current.archived) ? 1 : 0,
    Date.now(),
    id,
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM wealth_goals WHERE id = ?", id);
}

export type WealthDump = {
  version: 1;
  updatedAt: number;
  accounts: WealthAccount[];
  assets: WealthAsset[];
  quotes?: WealthQuote[];
  txs: WealthTx[];
  goals: WealthGoal[];
};

export async function dumpWealth(): Promise<WealthDump> {
  const [accounts, assets, quotes, txs, goals] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listAssets({ includeArchived: true }),
    listQuotes(),
    listTx(),
    listGoals({ includeArchived: true }),
  ]);
  const updatedAt = Math.max(
    0,
    ...accounts.map((item) => item.createdAt),
    ...assets.map((item) => Math.max(item.createdAt, item.updatedAt)),
    ...quotes.map((item) => Math.max(item.bookedAt, item.createdAt)),
    ...txs.map((item) => Math.max(item.bookedAt, item.createdAt)),
    ...goals.map((item) => Math.max(item.createdAt, item.updatedAt)),
  );
  return { version: 1, updatedAt, accounts, assets, quotes, txs, goals };
}

export async function replaceWealth(dump: WealthDump): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM wealth_goals");
    await db.runAsync("DELETE FROM wealth_quotes");
    await db.runAsync("DELETE FROM wealth_tx");
    await db.runAsync("DELETE FROM wealth_assets");
    await db.runAsync("DELETE FROM wealth_accounts");
    for (const account of dump.accounts) {
      await db.runAsync(
        "INSERT INTO wealth_accounts (id, name, kind, currency, created_at, archived) VALUES (?, ?, ?, ?, ?, ?)",
        account.id,
        account.name,
        account.kind,
        account.currency || "EUR",
        account.createdAt,
        account.archived ? 1 : 0,
      );
    }
    for (const asset of dump.assets) {
      await db.runAsync(
        `INSERT INTO wealth_assets (id, name, ticker, kind, account_id, quantity, price, cost_basis, currency, created_at, updated_at, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        asset.id,
        asset.name,
        asset.ticker,
        asset.kind,
        asset.accountId ?? null,
        asset.quantity,
        asset.price,
        asset.costBasis,
        asset.currency || "EUR",
        asset.createdAt,
        asset.updatedAt,
        asset.archived ? 1 : 0,
      );
    }
    for (const quote of dump.quotes ?? []) {
      await db.runAsync(
        "INSERT INTO wealth_quotes (id, asset_id, price, booked_at, created_at) VALUES (?, ?, ?, ?, ?)",
        quote.id,
        quote.assetId,
        quote.price,
        quote.bookedAt,
        quote.createdAt,
      );
    }
    for (const tx of dump.txs) {
      await db.runAsync(
        `INSERT INTO wealth_tx (id, kind, amount, currency, title, category, account_id, asset_id, counter_account_id, quantity, unit_price, booked_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tx.id,
        tx.kind,
        tx.amount,
        tx.currency || "EUR",
        tx.title,
        tx.category,
        tx.accountId,
        tx.assetId,
        tx.counterAccountId,
        tx.quantity,
        tx.unitPrice,
        tx.bookedAt,
        tx.notes,
        tx.createdAt,
      );
    }
    for (const goal of dump.goals ?? []) {
      await db.runAsync(
        `INSERT INTO wealth_goals (id, name, target, scope, account_id, asset_id, deadline_at, created_at, updated_at, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        goal.id,
        goal.name,
        goal.target,
        goal.scope,
        goal.accountId,
        goal.assetId,
        goal.deadlineAt,
        goal.createdAt,
        goal.updatedAt,
        goal.archived ? 1 : 0,
      );
    }
  });
  await ensureCashAccount();
}
