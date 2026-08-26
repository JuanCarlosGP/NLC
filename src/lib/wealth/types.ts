export type WealthAccountKind = "cash" | "bank" | "wallet";
export type WealthAssetKind = "stock" | "etf" | "crypto" | "fund" | "portfolio" | "other";
export type WealthTxKind = "income" | "expense" | "buy" | "sell" | "transfer";
export type WealthRange = "1d" | "1w" | "1m" | "1y" | "max";
export type WealthHomeTab = "wealth" | "cash" | "goals";
export type WealthGoalScope = "networth" | "cash" | "account" | "asset";

export type WealthAccount = {
  id: string;
  name: string;
  kind: WealthAccountKind;
  currency: string;
  createdAt: number;
  archived: boolean;
};

export type WealthAsset = {
  id: string;
  name: string;
  ticker: string;
  kind: WealthAssetKind;
  accountId: string | null;
  quantity: number;
  price: number;
  costBasis: number;
  currency: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export type WealthQuote = {
  id: string;
  assetId: string;
  price: number;
  bookedAt: number;
  createdAt: number;
};

export type WealthTx = {
  id: string;
  kind: WealthTxKind;
  amount: number;
  currency: string;
  title: string;
  category: string;
  accountId: string | null;
  assetId: string | null;
  counterAccountId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  bookedAt: number;
  notes: string;
  createdAt: number;
};

export type WealthGoal = {
  id: string;
  name: string;
  target: number;
  scope: WealthGoalScope;
  accountId: string | null;
  assetId: string | null;
  deadlineAt: number | null;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export const CASH_ACCOUNT_ID = "cash";
export const CASH_ACCOUNT_NAME = "Caja";

export const TX_KINDS: WealthTxKind[] = ["income", "expense", "buy", "sell", "transfer"];

export const TX_KIND_LABEL: Record<WealthTxKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  buy: "Compra",
  sell: "Venta",
  transfer: "Traspaso",
};

export const ASSET_KINDS: WealthAssetKind[] = ["stock", "etf", "crypto", "fund", "portfolio", "other"];

export const ASSET_KIND_LABEL: Record<WealthAssetKind, string> = {
  stock: "Acción",
  etf: "ETF",
  crypto: "Cripto",
  fund: "Fondo",
  portfolio: "Cartera",
  other: "Otro",
};

export const ACCOUNT_KINDS: WealthAccountKind[] = ["cash", "bank", "wallet"];

export const ACCOUNT_KIND_LABEL: Record<WealthAccountKind, string> = {
  cash: "Efectivo",
  bank: "Banco",
  wallet: "Monedero",
};

export const GOAL_SCOPES: WealthGoalScope[] = ["networth", "cash", "account", "asset"];

export const GOAL_SCOPE_LABEL: Record<WealthGoalScope, string> = {
  networth: "Patrimonio",
  cash: "Caja",
  account: "Cuenta",
  asset: "Inversión",
};

export function parseGoalScope(value?: string | null): WealthGoalScope | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "networth" || raw === "patrimonio" || raw === "total") return "networth";
  if (raw === "cash" || raw === "caja" || raw === "efectivo") return "cash";
  if (raw === "account" || raw === "cuenta") return "account";
  if (raw === "asset" || raw === "inversion" || raw === "inversión") return "asset";
  return null;
}

export const RANGE_OPTIONS: { id: WealthRange; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
  { id: "1m", label: "1M" },
  { id: "1y", label: "1A" },
  { id: "max", label: "Máx" },
];

export const EXPENSE_CATEGORIES = [
  "Casa",
  "Comida",
  "Ocio",
  "Transporte",
  "Salud",
  "Suscripciones",
  "Otro",
];

export const INCOME_CATEGORIES = ["Nómina", "Extra", "Venta", "Otro"];
