import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { dateLocale } from "@/lib/i18n/runtime";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { AmountInput } from "@/components/wealth/amount-input";
import { formatAmountInput, parseAmount } from "@/lib/wealth/money";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";
import {
  GOAL_SCOPE_LABEL,
  GOAL_SCOPES,
  type WealthGoal,
  type WealthGoalScope,
} from "@/lib/wealth/types";

const DEADLINE_PRESET_IDS = [
  { id: "none", key: "dates.noDate", months: null },
  { id: "3m", key: "wealth.in3m", months: 3 },
  { id: "6m", key: "wealth.in6m", months: 6 },
  { id: "1y", key: "wealth.in1y", months: 12 },
  { id: "2y", key: "wealth.in2y", months: 24 },
] as const;

function addMonths(months: number, from = Date.now()): number {
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function presetIdFor(deadlineAt: number | null): string {
  if (deadlineAt == null) return "none";
  const now = Date.now();
  for (const preset of DEADLINE_PRESET_IDS) {
    if (preset.months == null) continue;
    if (Math.abs(addMonths(preset.months, now) - deadlineAt) < 2 * 86_400_000) return preset.id;
  }
  return "custom";
}

export function GoalComposerSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: WealthGoal | null;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("wealth.closeGoal")}
      viewportRatio={0.82}
    >
      <GoalComposerBody open={open} goal={goal ?? null} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function GoalComposerBody({
  open,
  goal,
  onDone,
}: {
  open: boolean;
  goal: WealthGoal | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { assets, createGoal, updateGoal, deleteGoal } = useWealth();
  const accounts = useLiveAccounts();
  const liveAssets = useMemo(() => assets.filter((item) => !item.archived), [assets]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState<WealthGoalScope>("networth");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [deadlineId, setDeadlineId] = useState("none");
  const [customDeadline, setCustomDeadline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setAmount(goal ? formatAmountInput(goal.target) : "");
    setScope(goal?.scope ?? "networth");
    setAccountId(goal?.accountId ?? accounts[0]?.id ?? null);
    setAssetId(goal?.assetId ?? liveAssets[0]?.id ?? null);
    setDeadlineId(presetIdFor(goal?.deadlineAt ?? null));
    setCustomDeadline(goal?.deadlineAt ?? null);
    setBusy(false);
    setConfirmDelete(false);
  }, [goal, open]);

  const target = parseAmount(amount);
  const canSave =
    Boolean(name.trim()) &&
    target != null &&
    target > 0 &&
    (scope !== "account" || Boolean(accountId)) &&
    (scope !== "asset" || Boolean(assetId));

  function deadlineAt(): number | null {
    if (deadlineId === "custom") return customDeadline;
    const preset = DEADLINE_PRESET_IDS.find((item) => item.id === deadlineId);
    if (!preset || preset.months == null) return null;
    return addMonths(preset.months);
  }

  async function submit() {
    if (!canSave || busy || target == null) return;
    setBusy(true);
    try {
      const input = {
        name,
        target,
        scope,
        accountId: scope === "account" ? accountId : null,
        assetId: scope === "asset" ? assetId : null,
        deadlineAt: deadlineAt(),
      };
      if (goal) await updateGoal(goal.id, input);
      else await createGoal(input);
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.sectionTitle}>{goal ? t("wealth.goals") : t("wealth.newGoal")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("wealth.goalNamePlaceholder")}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <AmountInput
          value={amount}
          onChangeText={setAmount}
          placeholder={t("wealth.amountPlaceholder")}
          accessibilityLabel={t("wealth.goalAmountA11y")}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>{t("wealth.about")}</Text>
        <View style={styles.chips}>
          {GOAL_SCOPES.map((id) => {
            const active = scope === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  triggerUiHaptic();
                  setScope(id);
                }}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{GOAL_SCOPE_LABEL[id]}</Text>
              </Pressable>
            );
          })}
        </View>
        {scope === "account" ? (
          <View style={styles.chips}>
            {accounts.map((account) => {
              const active = accountId === account.id;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => {
                    triggerUiHaptic();
                    setAccountId(account.id);
                  }}
                  style={[styles.chip, active && styles.chipOn]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{account.name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {scope === "asset" ? (
          <View style={styles.chips}>
            {liveAssets.length ? (
              liveAssets.map((asset) => {
                const active = assetId === asset.id;
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => {
                      triggerUiHaptic();
                      setAssetId(asset.id);
                    }}
                    style={[styles.chip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{asset.name}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.hint}>{t("wealth.goalNeedAsset")}</Text>
            )}
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>{t("wealth.deadline")}</Text>
        <View style={styles.chips}>
          {DEADLINE_PRESET_IDS.map((item) => {
            const active = deadlineId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  triggerUiHaptic();
                  setDeadlineId(item.id);
                }}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{t(item.key)}</Text>
              </Pressable>
            );
          })}
          {deadlineId === "custom" && customDeadline ? (
            <View style={[styles.chip, styles.chipOn]}>
              <Text style={[styles.chipLabel, styles.chipLabelOn]}>
                {new Date(customDeadline).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.hint}>{t("wealth.goalPaceHint")}</Text>

        <Pressable
          disabled={!canSave || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, { opacity: !canSave || busy ? 0.4 : pressed ? 0.86 : 1 }]}
        >
          <Text style={styles.submitText}>{busy ? "…" : goal ? t("common.save") : t("common.create")}</Text>
        </Pressable>
        {goal ? (
          <Pressable
            onPress={() => {
              triggerUiHaptic();
              setConfirmDelete(true);
            }}
            style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.removeText}>{t("common.delete")}</Text>
          </Pressable>
        ) : null}
      </SheetScrollView>
      <ConfirmDialog
        open={confirmDelete}
        title={t("wealth.deleteGoal")}
        message={goal ? t("wealth.goalDeleteConfirm", { name: goal.name }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!goal) return;
          void (async () => {
            setBusy(true);
            await deleteGoal(goal.id);
            setBusy(false);
            setConfirmDelete(false);
            onDone();
          })();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 36,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
    paddingTop: 4,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
  chipLabelOn: { color: colors.void },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  submit: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  submitText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accentText },
  remove: { alignItems: "center", paddingVertical: 8 },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.danger },
});
