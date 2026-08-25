import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { subscribeAssistantMutations } from "@/lib/cursor/assistant-bus";
import { useSettings } from "@/lib/settings/settings-context";
import {
  accountBalance,
  assetPosition,
  cashTotal,
  changePct,
  chartSeries,
  goalProgress,
  netWorth,
  sortGoalProgress,
  type AssetPosition,
  type ChartPoint,
  type GoalProgress,
} from "@/lib/wealth/compute";
import {
  archiveAccount as persistArchiveAccount,
  createAccount as persistCreateAccount,
  createAsset as persistCreateAsset,
  createGoal as persistCreateGoal,
  createTx as persistCreateTx,
  deleteGoal as persistDeleteGoal,
  deleteTx as persistDeleteTx,
  ensureCashAccount,
  listAccounts,
  listAssets,
  listGoals,
  listTx,
  renameAccount as persistRenameAccount,
  updateAsset as persistUpdateAsset,
  updateGoal as persistUpdateGoal,
  type CreateTxInput,
} from "@/lib/wealth/store";
import { onWealthStoreChanged, pullWealthFromSources, pushWealthToSources } from "@/lib/wealth/sync";
import type {
  WealthAccount,
  WealthAccountKind,
  WealthAsset,
  WealthAssetKind,
  WealthGoal,
  WealthGoalScope,
  WealthRange,
  WealthTx,
} from "@/lib/wealth/types";

type CreateGoalInput = {
  name: string;
  target: number;
  scope?: WealthGoalScope;
  accountId?: string | null;
  assetId?: string | null;
  deadlineAt?: number | null;
};

type UpdateGoalInput = {
  name?: string;
  target?: number;
  scope?: WealthGoalScope;
  accountId?: string | null;
  assetId?: string | null;
  deadlineAt?: number | null;
  archived?: boolean;
};

type WealthContextValue = {
  ready: boolean;
  accounts: WealthAccount[];
  liveAccounts: WealthAccount[];
  assets: WealthAsset[];
  txs: WealthTx[];
  goals: WealthGoal[];
  cash: number;
  invested: number;
  total: number;
  positions: AssetPosition[];
  goalProgress: GoalProgress[];
  series: (range: WealthRange) => ChartPoint[];
  rangeChange: (range: WealthRange) => number | null;
  balanceOf: (accountId: string) => number;
  refresh: () => Promise<void>;
  createAccount: (name: string, kind?: WealthAccountKind) => Promise<WealthAccount>;
  renameAccount: (id: string, name: string) => Promise<void>;
  archiveAccount: (id: string, archived?: boolean) => Promise<void>;
  createAsset: (input: {
    name: string;
    ticker?: string;
    kind?: WealthAssetKind;
    quantity?: number;
    price?: number;
    costBasis?: number;
  }) => Promise<WealthAsset>;
  updateAsset: (
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
  ) => Promise<void>;
  createTx: (input: CreateTxInput) => Promise<WealthTx>;
  deleteTx: (id: string) => Promise<void>;
  createGoal: (input: CreateGoalInput) => Promise<WealthGoal>;
  updateGoal: (id: string, patch: UpdateGoalInput) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
};

const WealthContext = createContext<WealthContextValue | null>(null);

export function WealthProvider({ children }: { children: ReactNode }) {
  const { ready: settingsReady, settings, password } = useSettings();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<WealthAccount[]>([]);
  const [assets, setAssets] = useState<WealthAsset[]>([]);
  const [txs, setTxs] = useState<WealthTx[]>([]);
  const [goals, setGoals] = useState<WealthGoal[]>([]);
  const settingsRef = useRef(settings);
  const passwordRef = useRef(password);
  settingsRef.current = settings;
  passwordRef.current = password;

  const refresh = useCallback(async () => {
    await ensureCashAccount();
    const [nextAccounts, nextAssets, nextTxs, nextGoals] = await Promise.all([
      listAccounts({ includeArchived: true }),
      listAssets({ includeArchived: true }),
      listTx(),
      listGoals({ includeArchived: true }),
    ]);
    setAccounts(nextAccounts);
    setAssets(nextAssets);
    setTxs(nextTxs);
    setGoals(nextGoals);
    setReady(true);
  }, []);

  useEffect(() => onWealthStoreChanged(() => {
    void refresh();
  }), [refresh]);

  const mirror = useCallback(async () => {
    try {
      await pushWealthToSources(settingsRef.current, passwordRef.current);
    } catch {
      // NAS / carpeta local are best-effort.
    }
  }, []);

  useEffect(() => subscribeAssistantMutations(() => {
    void refresh().then(() => void mirror());
  }), [mirror, refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (settingsReady) {
          await pullWealthFromSources(settings, password);
        }
        if (!cancelled) await refresh();
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [password, refresh, settings.wealthLocalFolderUri, settings.wealthSharePath, settingsReady]);

  const liveAccounts = useMemo(() => accounts.filter((item) => !item.archived), [accounts]);
  const liveAssets = useMemo(() => assets.filter((item) => !item.archived && item.quantity > 0), [assets]);
  const liveGoals = useMemo(() => goals.filter((item) => !item.archived), [goals]);
  const cash = useMemo(() => cashTotal(liveAccounts, txs), [liveAccounts, txs]);
  const positions = useMemo(() => liveAssets.map(assetPosition).sort((a, b) => b.value - a.value), [liveAssets]);
  const invested = useMemo(
    () => positions.reduce((sum, item) => sum + item.value, 0),
    [positions],
  );
  const total = useMemo(() => netWorth(liveAccounts, liveAssets, txs), [liveAccounts, liveAssets, txs]);
  const progress = useMemo(
    () =>
      sortGoalProgress(
        liveGoals.map((goal) => goalProgress(goal, liveAccounts, assets, txs)),
      ),
    [assets, liveAccounts, liveGoals, txs],
  );

  const value = useMemo<WealthContextValue>(
    () => ({
      ready,
      accounts,
      liveAccounts,
      assets,
      txs,
      goals,
      cash,
      invested,
      total,
      positions,
      goalProgress: progress,
      series: (range) => chartSeries(liveAccounts, liveAssets, txs, range),
      rangeChange: (range) => changePct(chartSeries(liveAccounts, liveAssets, txs, range)),
      balanceOf: (accountId) => accountBalance(accountId, txs),
      refresh,
      createAccount: async (name, kind) => {
        const created = await persistCreateAccount(name, kind);
        await refresh();
        void mirror();
        return created;
      },
      renameAccount: async (id, name) => {
        await persistRenameAccount(id, name);
        await refresh();
        void mirror();
      },
      archiveAccount: async (id, archived) => {
        await persistArchiveAccount(id, archived);
        await refresh();
        void mirror();
      },
      createAsset: async (input) => {
        const created = await persistCreateAsset(input);
        await refresh();
        void mirror();
        return created;
      },
      updateAsset: async (id, patch) => {
        await persistUpdateAsset(id, patch);
        await refresh();
        void mirror();
      },
      createTx: async (input) => {
        const created = await persistCreateTx(input);
        await refresh();
        void mirror();
        return created;
      },
      deleteTx: async (id) => {
        await persistDeleteTx(id);
        await refresh();
        void mirror();
      },
      createGoal: async (input) => {
        const created = await persistCreateGoal(input);
        await refresh();
        void mirror();
        return created;
      },
      updateGoal: async (id, patch) => {
        await persistUpdateGoal(id, patch);
        await refresh();
        void mirror();
      },
      deleteGoal: async (id) => {
        await persistDeleteGoal(id);
        await refresh();
        void mirror();
      },
    }),
    [accounts, assets, cash, goals, invested, liveAccounts, liveAssets, mirror, positions, progress, ready, refresh, total, txs],
  );

  return <WealthContext.Provider value={value}>{children}</WealthContext.Provider>;
}

export function useWealth(): WealthContextValue {
  const ctx = useContext(WealthContext);
  if (!ctx) throw new Error("useWealth must be used within WealthProvider");
  return ctx;
}

export function useLiveAccounts(): WealthAccount[] {
  return useWealth().liveAccounts;
}

export function useLiveGoals(): WealthGoal[] {
  return useWealth().goals.filter((item) => !item.archived);
}
