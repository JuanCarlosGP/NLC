import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpDown, Plus, Search } from "lucide-react-native";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { ZoneSwitch } from "@/components/layout/zone-switch";
import { Screen } from "@/components/ui/screen";
import { AccountActivitySheet } from "@/components/wealth/account-activity-sheet";
import { AccountComposerSheet, AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { GoalComposerSheet } from "@/components/wealth/goal-composer-sheet";
import { GoalRow, goalListStyle } from "@/components/wealth/goal-row";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { WealthChart } from "@/components/wealth/wealth-chart";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { formatEuro, formatPct } from "@/lib/wealth/money";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";
import {
  ACCOUNT_KIND_LABEL,
  accountDisplayName,
  RANGE_OPTIONS,
  type WealthAccount,
  type WealthAsset,
  type WealthGoal,
  type WealthHomeTab,
  type WealthRange,
  type WealthTxKind,
} from "@/lib/wealth/types";

export function WealthHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { total, cash, positions, txs, series, rangeChange, balanceOf, holdingsOf, ready, goalProgress } = useWealth();
  const accounts = useLiveAccounts();
  const [tab, setTab] = useState<WealthHomeTab>("wealth");
  const [range, setRange] = useState<WealthRange>("1w");
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<WealthTxKind>("income");
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<WealthAsset | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<WealthGoal | null>(null);
  const [previewAccount, setPreviewAccount] = useState<WealthAccount | null>(null);
  const [assetAccountId, setAssetAccountId] = useState<string | null>(null);

  const homeTabs = useMemo(
    (): { id: WealthHomeTab; label: string }[] => [
      { id: "wealth", label: t("wealth.title") },
      { id: "cash", label: t("wealth.cash") },
      { id: "goals", label: t("wealth.goals") },
    ],
    [t],
  );

  const points = useMemo(() => series(range), [range, series]);
  const change = rangeChange(range);
  const up = (change ?? 0) >= 0;
  const nextGoal = goalProgress.find((item) => !item.reached);
  const headline =
    tab === "wealth" ? total : tab === "cash" ? cash : nextGoal ? nextGoal.remaining : 0;
  const recent = txs.slice(0, 6);

  function openTx(kind: WealthTxKind) {
    triggerUiHaptic();
    setTxKind(kind);
    setTxOpen(true);
  }

  function openGoal(goal?: WealthGoal | null) {
    triggerUiHaptic();
    setEditingGoal(goal ?? null);
    setGoalOpen(true);
  }

  function openAsset(next?: WealthAsset | null, accountId?: string | null) {
    triggerUiHaptic();
    setEditingAsset(next ?? null);
    setAssetAccountId(accountId ?? next?.accountId ?? null);
    setAssetOpen(true);
  }

  return (
    <>
      <Screen>
        <View style={styles.hero}>
          <LadybugMark />
          <ZoneSwitch />
        </View>

        <View style={styles.tabs}>
          {homeTabs.map((item) => {
            const on = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (on) return;
                  triggerUiHaptic();
                  setTab(item.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tab, on && styles.tabOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.balanceBlock}>
          <Text style={type.label}>
            {tab === "wealth"
              ? t("wealth.total")
              : tab === "cash"
                ? t("wealth.cashAmount")
                : nextGoal
                  ? t("wealth.remainingGoal", { name: nextGoal.goal.name })
                  : t("wealth.goals")}
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balance}>
              {ready
                ? tab === "goals" && !nextGoal
                  ? goalProgress.length
                    ? t("wealth.ready")
                    : "—"
                  : formatEuro(headline)
                : "…"}
            </Text>
            {tab === "wealth" ? (
              <Text style={[styles.chg, up ? styles.up : styles.down]}>{formatPct(change)}</Text>
            ) : tab === "goals" && nextGoal ? (
              <Text style={styles.chg}>{`${Math.round(nextGoal.pct * 100)} %`}</Text>
            ) : null}
          </View>
        </View>

        {tab === "wealth" ? (
          <>
            <View style={styles.chartCard}>
              <WealthChart points={points} up={up} range={range} />
              <View style={styles.ranges}>
                {RANGE_OPTIONS.map((item) => {
                  const active = range === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        triggerUiHaptic();
                        setRange(item.id);
                      }}
                      style={[styles.rangeBtn, active && styles.rangeBtnOn]}
                    >
                      <Text style={[styles.rangeLabel, active && styles.rangeOn]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.cards}>
          <QuickCard
            title={t("wealth.activity")}
            hint={`${txs.length}`}
            addLabel={t("wealth.newTx")}
            onPress={() => router.push("/wealth/activity")}
            onAdd={() => openTx("income")}
          />
          <QuickCard
            title={t("wealth.assets")}
            hint={`${positions.length}`}
            addLabel={t("wealth.newAsset")}
            onPress={() => router.push("/wealth/assets")}
            onAdd={() => openAsset()}
          />
          <QuickCard
            title={t("wealth.accounts")}
            hint={`${accounts.length}`}
            addLabel={t("wealth.newAccount")}
            onPress={() => router.push("/wealth/accounts")}
            onAdd={() => {
              triggerUiHaptic();
              setAccountOpen(true);
            }}
          />
          <QuickCard
            title={t("wealth.goals")}
            hint={`${goalProgress.length}`}
            addLabel={t("wealth.newGoal")}
            onPress={() => router.push("/wealth/goals")}
            onAdd={() => openGoal()}
          />
        </View>

        {tab === "goals" ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>{t("wealth.goals")}</Text>
              <Pressable onPress={() => openGoal()}>
                <Text style={styles.link}>{t("wealth.add")}</Text>
              </Pressable>
            </View>
            {goalProgress.length ? (
              <View style={goalListStyle}>
                {goalProgress.map((item) => (
                  <GoalRow key={item.goal.id} progress={item} onPress={() => openGoal(item.goal)} />
                ))}
              </View>
            ) : (
              <Text style={type.body}>{t("wealth.goalsHint")}</Text>
            )}
          </View>
        ) : tab === "wealth" ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>{t("wealth.assets")}</Text>
              <Pressable onPress={() => openAsset()}>
                <Text style={styles.link}>{t("wealth.add")}</Text>
              </Pressable>
            </View>
            {positions.length ? (
              <View style={assetListStyle}>
                {positions.map((position) => (
                  <AssetRow
                    key={position.asset.id}
                    position={position}
                    onPress={() => openAsset(position.asset)}
                  />
                ))}
              </View>
            ) : (
              <Text style={type.body}>{t("wealth.emptyPositionsBuy")}</Text>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>{t("wealth.accounts")}</Text>
              <Pressable onPress={() => setAccountOpen(true)}>
                <Text style={styles.link}>{t("wealth.add")}</Text>
              </Pressable>
            </View>
            {accounts.map((account) => {
              const cashBal = balanceOf(account.id);
              const invested = holdingsOf(account.id);
              const kindLabel = ACCOUNT_KIND_LABEL[account.kind];
              const meta = invested > 0.004 ? `${kindLabel} · ${t("wealth.investedIn", { amount: formatEuro(invested) })}` : kindLabel;
              return (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityLabel={`${accountDisplayName(account)}, ${formatEuro(cashBal)}`}
                onPress={() => {
                  triggerUiHaptic();
                  setPreviewAccount(account);
                }}
                style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.72 : 1 }]}
              >
                <View>
                  <Text style={styles.accountName}>{accountDisplayName(account)}</Text>
                  <Text style={type.meta}>{meta}</Text>
                </View>
                <Text style={styles.accountBal}>{formatEuro(cashBal)}</Text>
              </Pressable>
              );
            })}
            {recent.length ? (
              <View style={styles.section}>
                <Text style={type.sectionTitle}>{t("wealth.recentActivity")}</Text>
                <View style={txListStyle}>
                  {recent.map((tx) => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </View>
              </View>
            ) : (
              <Text style={type.body}>{t("wealth.registerIncomeHint")}</Text>
            )}
          </View>
        )}

        <View style={styles.actions}>
          {tab === "goals" ? (
            <Pressable
              onPress={() => openGoal()}
              style={({ pressed }) => [styles.action, { opacity: pressed ? 0.86 : 1 }]}
            >
              <Plus size={18} color={colors.void} strokeWidth={2} />
              <Text style={styles.actionLabel}>{t("wealth.newGoal")}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => openTx("income")}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.86 : 1 }]}
              >
                <Search size={18} color={colors.void} strokeWidth={2} />
                <Text style={styles.actionLabel}>{t("wealth.income")}</Text>
              </Pressable>
              <Pressable
                onPress={() => openTx(tab === "cash" ? "transfer" : "expense")}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.86 : 1 }]}
              >
                {tab === "cash" ? (
                  <ArrowUpDown size={18} color={colors.void} strokeWidth={2} />
                ) : (
                  <Plus size={18} color={colors.void} strokeWidth={2} />
                )}
                <Text style={styles.actionLabel}>{tab === "cash" ? t("wealth.transfer") : t("wealth.expense")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Screen>
      <TxComposerSheet open={txOpen} onOpenChange={setTxOpen} defaultKind={txKind} />
      <AssetComposerSheet
        open={assetOpen}
        asset={editingAsset}
        defaultAccountId={assetAccountId}
        onOpenChange={(next) => {
          setAssetOpen(next);
          if (!next) {
            setEditingAsset(null);
            setAssetAccountId(null);
          }
        }}
      />
      <AccountComposerSheet open={accountOpen} onOpenChange={setAccountOpen} />
      <AccountActivitySheet
        account={previewAccount}
        onOpenChange={(open) => {
          if (!open) setPreviewAccount(null);
        }}
        onEditAsset={(asset) => {
          if (!previewAccount) return;
          openAsset(asset, previewAccount.id);
        }}
      />
      <GoalComposerSheet
        open={goalOpen}
        onOpenChange={(next) => {
          setGoalOpen(next);
          if (!next) setEditingGoal(null);
        }}
        goal={editingGoal}
      />
    </>
  );
}

function QuickCard({
  title,
  hint,
  addLabel,
  onPress,
  onAdd,
}: {
  title: string;
  hint: string;
  addLabel: string;
  onPress: () => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.cardMain, { opacity: pressed ? 0.86 : 1 }]}
      >
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardHint}>{hint}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        hitSlop={6}
        onPress={onAdd}
        style={({ pressed }) => [styles.cardAdd, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Plus size={15} color={colors.muted} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 16,
    paddingTop: 8,
  },
  tab: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 34,
    color: colors.muted,
  },
  tabOn: { color: colors.ink },
  balanceBlock: { gap: 6, paddingTop: 8 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  balance: {
    fontFamily: fonts.sansBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: colors.ink,
    flexShrink: 1,
  },
  chg: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    paddingBottom: 4,
  },
  up: { color: colors.ok },
  down: { color: colors.danger },
  chartCard: {
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.sheetRaised,
    borderRadius: 18,
  },
  ranges: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
  },
  rangeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
  },
  rangeBtnOn: {
    backgroundColor: colors.sheetHover,
  },
  rangeLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.muted,
  },
  rangeOn: { color: colors.ink },
  cards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
  },
  card: {
    flexGrow: 1,
    flexBasis: "47%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.sheetRaised,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
  },
  cardMain: {
    flex: 1,
    gap: 6,
    paddingVertical: 4,
  },
  cardAdd: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
  },
  cardHint: {
    fontFamily: fonts.sans,
    fontSize: 18,
    color: colors.inkSoft,
  },
  section: { gap: 8, paddingTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accent,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  accountName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  accountBal: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.void,
  },
});
