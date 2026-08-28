import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { useWealth } from "@/lib/wealth/wealth-context";
import { TX_KIND_LABEL, TX_KINDS, type WealthTxKind } from "@/lib/wealth/types";

export function WealthLedger({ title }: { title?: string }) {
  const { t } = useI18n();
  const { txs } = useWealth();
  const [filter, setFilter] = useState<WealthTxKind | null>(null);
  const [open, setOpen] = useState(false);
  const visible = useMemo(() => (filter ? txs.filter((tx) => tx.kind === filter) : txs), [filter, txs]);
  const pageTitle = title ?? t("wealth.activity");

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>{pageTitle}</Text>
          <Pressable
            accessibilityLabel={t("wealth.newTx")}
            onPress={() => {
              triggerUiHaptic();
              setOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>
        <View style={styles.chips}>
          <Pressable onPress={() => setFilter(null)} style={[styles.chip, filter == null && styles.chipOn]}>
            <Text style={[styles.chipLabel, filter == null && styles.chipLabelOn]}>{t("wealth.all")}</Text>
          </Pressable>
          {TX_KINDS.map((kind) => {
            const active = filter === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => setFilter(kind)}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{TX_KIND_LABEL[kind]}</Text>
              </Pressable>
            );
          })}
        </View>
        {visible.length ? (
          <View style={txListStyle}>
            {visible.map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
          </View>
        ) : (
          <Text style={type.body}>{t("wealth.emptyFilter")}</Text>
        )}
      </Screen>
      <TxComposerSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: { flex: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
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
});
