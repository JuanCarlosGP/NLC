import { t } from "@/lib/i18n/runtime";

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
  get income() {
    return t("wealth.tx.income");
  },
  get expense() {
    return t("wealth.tx.expense");
  },
  get buy() {
    return t("wealth.tx.buy");
  },
  get sell() {
    return t("wealth.tx.sell");
  },
  get transfer() {
    return t("wealth.tx.transfer");
  },
};

export const ASSET_KINDS: WealthAssetKind[] = ["stock", "etf", "crypto", "fund", "portfolio", "other"];

export const ASSET_KIND_LABEL: Record<WealthAssetKind, string> = {
  get stock() {
    return t("wealth.assetKind.stock");
  },
  get etf() {
    return t("wealth.assetKind.etf");
  },
  get crypto() {
    return t("wealth.assetKind.crypto");
  },
  get fund() {
    return t("wealth.assetKind.fund");
  },
  get portfolio() {
    return t("wealth.assetKind.portfolio");
  },
  get other() {
    return t("wealth.assetKind.other");
  },
};

export const ACCOUNT_KINDS: WealthAccountKind[] = ["cash", "bank", "wallet"];

export const ACCOUNT_KIND_LABEL: Record<WealthAccountKind, string> = {
  get cash() {
    return t("wealth.accountKind.cash");
  },
  get bank() {
    return t("wealth.accountKind.bank");
  },
  get wallet() {
    return t("wealth.accountKind.wallet");
  },
};

export const GOAL_SCOPES: WealthGoalScope[] = ["networth", "cash", "account", "asset"];

export const GOAL_SCOPE_LABEL: Record<WealthGoalScope, string> = {
  get networth() {
    return t("wealth.scope.networth");
  },
  get cash() {
    return t("wealth.scope.cash");
  },
  get account() {
    return t("wealth.scope.account");
  },
  get asset() {
    return t("wealth.scope.asset");
  },
};

export function accountDisplayName(account: { id: string; name: string }): string {
  return account.id === CASH_ACCOUNT_ID ? t("wealth.cash") : account.name;
}

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
  { id: "1d", get label() { return t("wealth.range.1d"); } },
  { id: "1w", get label() { return t("wealth.range.1w"); } },
  { id: "1m", get label() { return t("wealth.range.1m"); } },
  { id: "1y", get label() { return t("wealth.range.1y"); } },
  { id: "max", get label() { return t("wealth.range.max"); } },
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
