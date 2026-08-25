import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpDown, Plus, Search } from "lucide-react-native";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { ZoneSwitch } from "@/components/layout/zone-switch";
import { Screen } from "@/components/ui/screen";
import { AccountComposerSheet, AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { GoalComposerSheet } from "@/components/wealth/goal-composer-sheet";
import { GoalRow, goalListStyle } from "@/components/wealth/goal-row";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { WealthChart } from "@/components/wealth/wealth-chart";
import { assetHref } from "@/lib/library/href";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { changePct, formatChartScrub, type ChartPoint } from "@/lib/wealth/compute";
import { formatEuro, formatPct } from "@/lib/wealth/money";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";
import { RANGE_OPTIONS, type WealthGoal, type WealthHomeTab, type WealthRange, type WealthTxKind } from "@/lib/wealth/types";

export function WealthHome() {
  const router = useRouter();
  const { total, cash, positions, txs, series, rangeChange, balanceOf, ready, goalProgress } = useWealth();
  const accounts = useLiveAccounts();
  const [tab, setTab] = useState<WealthHomeTab>("wealth");
  const [range, setRange] = useState<WealthRange>("max");
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<WealthTxKind>("income");
  const [assetOpen, setAssetOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<WealthGoal | null>(null);
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const points = useMemo(() => series(range), [range, series]);
  const change = rangeChange(range);
  const scrubChange = scrub && points[0] ? changePct([points[0], scrub]) : change;
  const up = (change ?? 0) >= 0;
  const shownUp = (scrubChange ?? 0) >= 0;
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

  return (
    <>
      <Screen>
        <View style={styles.hero}>
          <LadybugMark />
          <ZoneSwitch />
        </View>

        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("wealth")} accessibilityRole="button">
            <Text style={[styles.tab, tab === "wealth" && styles.tabOn]}>Patrimonio</Text>
          </Pressable>
          <Pressable onPress={() => setTab("cash")} accessibilityRole="button">
            <Text style={[styles.tab, tab === "cash" && styles.tabOn]}>Caja</Text>
          </Pressable>
          <Pressable onPress={() => setTab("goals")} accessibilityRole="button">
            <Text style={[styles.tab, tab === "goals" && styles.tabOn]}>Objetivos</Text>
          </Pressable>
        </View>

        <View style={styles.balanceBlock}>
          <Text style={type.label}>
            {tab === "wealth"
              ? scrub
                ? formatChartScrub(scrub.at, range)
                : "Total"
              : tab === "cash"
                ? "Efectivo"
                : nextGoal
                  ? `Faltan · ${nextGoal.goal.name}`
                  : "Objetivos"}
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balance}>
              {ready
                ? tab === "goals" && !nextGoal
                  ? goalProgress.length
                    ? "Listo"
                    : "—"
                  : formatEuro(tab === "wealth" && scrub ? scrub.value : headline)
                : "…"}
            </Text>
            {tab === "wealth" ? (
              <Text style={[styles.chg, shownUp ? styles.up : styles.down]}>{formatPct(scrubChange)}</Text>
            ) : tab === "goals" && nextGoal ? (
              <Text style={styles.chg}>{`${Math.round(nextGoal.pct * 100)} %`}</Text>
            ) : null}
          </View>
        </View>

        {tab === "wealth" ? (
          <>
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
            <WealthChart points={points} up={up} range={range} onScrub={setScrub} />
          </>
        ) : null}

        <View style={styles.cards}>
          <QuickCard
            title="Movimientos"
            hint={`${txs.length}`}
            onPress={() => router.push("/wealth/activity")}
          />
          <QuickCard title="Inversiones" hint={`${positions.length}`} onPress={() => router.push("/wealth/assets")} />
          <QuickCard title="Cuentas" hint={`${accounts.length}`} onPress={() => router.push("/wealth/accounts")} />
          <QuickCard title="Objetivos" hint={`${goalProgress.length}`} onPress={() => router.push("/wealth/goals")} />
        </View>

        {tab === "goals" ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>Objetivos</Text>
              <Pressable onPress={() => openGoal()}>
                <Text style={styles.link}>Añadir</Text>
              </Pressable>
            </View>
            {goalProgress.length ? (
              <View style={goalListStyle}>
                {goalProgress.map((item) => (
                  <GoalRow key={item.goal.id} progress={item} onPress={() => openGoal(item.goal)} />
                ))}
              </View>
            ) : (
              <Text style={type.body}>
                Fija un importe y NLC estima cuándo llegas según el ritmo de los últimos meses.
              </Text>
            )}
          </View>
        ) : tab === "wealth" ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>Inversiones</Text>
              <Pressable onPress={() => setAssetOpen(true)}>
                <Text style={styles.link}>Añadir</Text>
              </Pressable>
            </View>
            {positions.length ? (
              <View style={assetListStyle}>
                {positions.map((position) => (
                  <AssetRow
                    key={position.asset.id}
                    position={position}
                    onPress={() => router.push(assetHref(position.asset.id))}
                  />
                ))}
              </View>
            ) : (
              <Text style={type.body}>Aún no hay posiciones. Compra o registra una inversión.</Text>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={type.sectionTitle}>Cuentas</Text>
              <Pressable onPress={() => setAccountOpen(true)}>
                <Text style={styles.link}>Añadir</Text>
              </Pressable>
            </View>
            {accounts.map((account) => (
              <View key={account.id} style={styles.accountRow}>
                <View>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={type.meta}>{account.kind === "bank" ? "Banco" : account.kind === "wallet" ? "Monedero" : "Efectivo"}</Text>
                </View>
                <Text style={styles.accountBal}>{formatEuro(balanceOf(account.id))}</Text>
              </View>
            ))}
            {recent.length ? (
              <View style={styles.section}>
                <Text style={type.sectionTitle}>Últimos movimientos</Text>
                <View style={txListStyle}>
                  {recent.map((tx) => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </View>
              </View>
            ) : (
              <Text style={type.body}>Registra un ingreso para empezar el saldo.</Text>
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
              <Text style={styles.actionLabel}>Nuevo objetivo</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => openTx("income")}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.86 : 1 }]}
              >
                <Search size={18} color={colors.void} strokeWidth={2} />
                <Text style={styles.actionLabel}>Ingreso</Text>
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
                <Text style={styles.actionLabel}>{tab === "cash" ? "Traspaso" : "Gasto"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Screen>
      <TxComposerSheet open={txOpen} onOpenChange={setTxOpen} defaultKind={txKind} />
      <AssetComposerSheet open={assetOpen} onOpenChange={setAssetOpen} />
      <AccountComposerSheet open={accountOpen} onOpenChange={setAccountOpen} />
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

function QuickCard({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.86 : 1 }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardHint}>{hint}</Text>
    </Pressable>
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
  ranges: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 2,
    marginTop: 8,
    padding: 3,
    backgroundColor: colors.sheetRaised,
    borderRadius: 999,
  },
  rangeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  rangeBtnOn: {
    backgroundColor: colors.ink,
  },
  rangeLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
  rangeOn: { color: colors.void },
  cards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
  },
  card: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: colors.sheetRaised,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
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
