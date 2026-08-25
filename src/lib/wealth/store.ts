import { getDb } from "@/lib/db/client";
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
  quantity: number;
  price: number;
  cost_basis: number;
  currency: string;
  created_at: number;
  updated_at: number;
  archived: number;
};

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
    row.kind === "stock" || row.kind === "crypto" || row.kind === "fund" ? row.kind : "other";
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    kind,
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
  if (!trimmed) throw new Error("La cuenta necesita un nombre.");
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
        "SELECT id, name, ticker, kind, quantity, price, cost_basis, currency, created_at, updated_at, archived FROM wealth_assets ORDER BY archived ASC, name ASC",
      )
    : await db.getAllAsync<AssetRow>(
        "SELECT id, name, ticker, kind, quantity, price, cost_basis, currency, created_at, updated_at, archived FROM wealth_assets WHERE archived = 0 ORDER BY name ASC",
      );
  return rows.map(mapAsset);
}

export async function getAsset(id: string): Promise<WealthAsset | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AssetRow>(
    "SELECT id, name, ticker, kind, quantity, price, cost_basis, currency, created_at, updated_at, archived FROM wealth_assets WHERE id = ?",
    id,
  );
  return row ? mapAsset(row) : null;
}

export async function createAsset(input: {
  name: string;
  ticker?: string;
  kind?: WealthAssetKind;
  quantity?: number;
  price?: number;
  costBasis?: number;
}): Promise<WealthAsset> {
  const name = input.name.trim();
  if (!name) throw new Error("La inversión necesita un nombre.");
  const db = await getDb();
  const id = newId("ast");
  const now = Date.now();
  const ticker = input.ticker?.trim().toUpperCase() ?? "";
  const kind = input.kind ?? "other";
  const quantity = input.quantity ?? 0;
  const price = input.price ?? 0;
  const costBasis = input.costBasis ?? quantity * price;
  await db.runAsync(
    `INSERT INTO wealth_assets (id, name, ticker, kind, quantity, price, cost_basis, currency, created_at, updated_at, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, 0)`,
    id,
    name,
    ticker,
    kind,
    quantity,
    price,
    costBasis,
    now,
    now,
  );
  return {
    id,
    name,
    ticker,
    kind,
    quantity,
    price,
    costBasis,
    currency: "EUR",
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

export async function updateAsset(
  id: string,
  patch: {
    name?: string;
    ticker?: string;
    kind?: WealthAssetKind;
    quantity?: number;
    price?: number;
    costBasis?: number;
    archived?: boolean;
  },
): Promise<void> {
  const current = await getAsset(id);
  if (!current) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE wealth_assets
     SET name = ?, ticker = ?, kind = ?, quantity = ?, price = ?, cost_basis = ?, archived = ?, updated_at = ?
     WHERE id = ?`,
    patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    patch.ticker !== undefined ? patch.ticker.trim().toUpperCase() : current.ticker,
    patch.kind ?? current.kind,
    patch.quantity ?? current.quantity,
    patch.price ?? current.price,
    patch.costBasis ?? current.costBasis,
    (patch.archived ?? current.archived) ? 1 : 0,
    Date.now(),
    id,
  );
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
  if (!(input.amount > 0)) throw new Error("El importe tiene que ser mayor que cero.");
  const title = input.title.trim();
  if (!title) throw new Error("El movimiento necesita un concepto.");
  await ensureCashAccount();
  const db = await getDb();
  let assetId = input.assetId ?? null;
  const quantity =
    input.quantity ?? (input.kind === "buy" || input.kind === "sell" ? 1 : null);
  const unitPrice = input.unitPrice ?? (quantity ? input.amount / quantity : null);

  if ((input.kind === "buy" || input.kind === "sell") && !assetId) {
    if (input.kind === "sell") throw new Error("Elige la inversión que vendes.");
    const asset = await createAsset({
      name: input.assetName?.trim() || title,
      ticker: input.assetTicker,
      kind: input.assetKind,
      quantity: 0,
      price: unitPrice ?? 0,
      costBasis: 0,
    });
    assetId = asset.id;
  }

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
    assetId,
    input.counterAccountId ?? null,
    quantity,
    unitPrice,
    bookedAt,
    input.notes?.trim() ?? "",
    now,
  );

  if (assetId && quantity != null) {
    const asset = await getAsset(assetId);
    if (asset) {
      if (input.kind === "buy") {
        await updateAsset(assetId, {
          quantity: asset.quantity + quantity,
          price: unitPrice ?? asset.price,
          costBasis: asset.costBasis + input.amount,
        });
      } else if (input.kind === "sell") {
        const nextQty = Math.max(0, asset.quantity - quantity);
        const soldCost =
          asset.quantity > 0 ? (asset.costBasis * Math.min(quantity, asset.quantity)) / asset.quantity : 0;
        await updateAsset(assetId, {
          quantity: nextQty,
          price: unitPrice ?? asset.price,
          costBasis: Math.max(0, asset.costBasis - soldCost),
        });
      }
    }
  }

  const created = await getTx(id);
  if (!created) throw new Error("No se pudo guardar el movimiento.");
  return created;
}

export async function deleteTx(id: string): Promise<void> {
  const tx = await getTx(id);
  if (!tx) return;
  if (tx.assetId && tx.quantity != null) {
    const asset = await getAsset(tx.assetId);
    if (asset) {
      if (tx.kind === "buy") {
        const nextQty = Math.max(0, asset.quantity - tx.quantity);
        await updateAsset(tx.assetId, {
          quantity: nextQty,
          costBasis: Math.max(0, asset.costBasis - tx.amount),
        });
      } else if (tx.kind === "sell") {
        await updateAsset(tx.assetId, {
          quantity: asset.quantity + tx.quantity,
          costBasis: asset.costBasis + tx.amount,
        });
      }
    }
  }
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
  if (!name) throw new Error("El objetivo necesita un nombre.");
  if (!(input.target > 0)) throw new Error("El importe del objetivo tiene que ser mayor que cero.");
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
  txs: WealthTx[];
  goals: WealthGoal[];
};

export async function dumpWealth(): Promise<WealthDump> {
  const [accounts, assets, txs, goals] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listAssets({ includeArchived: true }),
    listTx(),
    listGoals({ includeArchived: true }),
  ]);
  const updatedAt = Math.max(
    0,
    ...accounts.map((item) => item.createdAt),
    ...assets.map((item) => Math.max(item.createdAt, item.updatedAt)),
    ...txs.map((item) => Math.max(item.bookedAt, item.createdAt)),
    ...goals.map((item) => Math.max(item.createdAt, item.updatedAt)),
  );
  return { version: 1, updatedAt, accounts, assets, txs, goals };
}

export async function replaceWealth(dump: WealthDump): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM wealth_goals");
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
        `INSERT INTO wealth_assets (id, name, ticker, kind, quantity, price, cost_basis, currency, created_at, updated_at, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        asset.id,
        asset.name,
        asset.ticker,
        asset.kind,
        asset.quantity,
        asset.price,
        asset.costBasis,
        asset.currency || "EUR",
        asset.createdAt,
        asset.updatedAt,
        asset.archived ? 1 : 0,
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
