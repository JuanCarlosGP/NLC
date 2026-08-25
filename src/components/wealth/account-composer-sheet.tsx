import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { AmountInput } from "@/components/wealth/amount-input";
import { parseAmount } from "@/lib/wealth/money";
import { useWealth } from "@/lib/wealth/wealth-context";
import {
  ACCOUNT_KIND_LABEL,
  ACCOUNT_KINDS,
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  type WealthAccountKind,
  type WealthAssetKind,
} from "@/lib/wealth/types";

export function AccountComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} accessibilityCloseLabel="Cerrar cuenta" viewportRatio={0.62}>
      <AccountComposerBody open={open} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function AccountComposerBody({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { createAccount } = useWealth();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WealthAccountKind>("bank");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("bank");
    setBusy(false);
  }, [open]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createAccount(name, kind);
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.sectionTitle}>Nueva cuenta</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="BBVA, Revolut…"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <View style={styles.chips}>
        {ACCOUNT_KINDS.map((id) => {
          const active = kind === id;
          return (
            <Pressable
              key={id}
              onPress={() => {
                triggerUiHaptic();
                setKind(id);
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{ACCOUNT_KIND_LABEL[id]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        disabled={!name.trim() || busy}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.submit, { opacity: !name.trim() || busy ? 0.4 : pressed ? 0.86 : 1 }]}
      >
        <Text style={styles.submitText}>{busy ? "…" : "Crear"}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

export function AssetComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar inversión"
      viewportRatio={0.72}
    >
      <AssetComposerBody open={open} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function AssetComposerBody({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { createAsset } = useWealth();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [kind, setKind] = useState<WealthAssetKind>("stock");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTicker("");
    setKind("stock");
    setQty("");
    setPrice("");
    setBusy(false);
  }, [open]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const quantity = parseAmount(qty, 8) ?? 0;
      const unit = parseAmount(price) ?? 0;
      await createAsset({
        name,
        ticker,
        kind,
        quantity,
        price: unit,
        costBasis: quantity * unit,
      });
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.sectionTitle}>Nueva inversión</Text>
      <TextInput value={name} onChangeText={setName} placeholder="SpaceX, Intel…" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput
        value={ticker}
        onChangeText={setTicker}
        placeholder="Ticker"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        style={styles.input}
      />
      <View style={styles.chips}>
        {ASSET_KINDS.map((id) => {
          const active = kind === id;
          return (
            <Pressable
              key={id}
              onPress={() => {
                triggerUiHaptic();
                setKind(id);
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{ASSET_KIND_LABEL[id]}</Text>
            </Pressable>
          );
        })}
      </View>
      <AmountInput
        value={qty}
        onChangeText={setQty}
        decimals={8}
        placeholder="Cantidad, 2 o 0,5"
        accessibilityLabel="Cantidad"
        style={styles.input}
      />
      <AmountInput
        value={price}
        onChangeText={setPrice}
        placeholder="Precio, 180,50"
        accessibilityLabel="Precio actual"
        style={styles.input}
      />
      <Pressable
        disabled={!name.trim() || busy}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.submit, { opacity: !name.trim() || busy ? 0.4 : pressed ? 0.86 : 1 }]}
      >
        <Text style={styles.submitText}>{busy ? "…" : "Añadir"}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
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
  submit: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  submitText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accentText },
});
