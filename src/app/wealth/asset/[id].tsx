import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { libraryParamId } from "@/lib/library/href";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { formatEuro, formatPct, formatSignedEuro, parseAmount } from "@/lib/wealth/money";
import { ASSET_KIND_LABEL } from "@/lib/wealth/types";
import { useWealth } from "@/lib/wealth/wealth-context";
import { assetPosition } from "@/lib/wealth/compute";

export default function WealthAssetScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = libraryParamId(raw);
  const { assets, txs, updateAsset } = useWealth();
  const asset = assets.find((item) => item.id === id);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  const position = useMemo(() => (asset ? assetPosition(asset) : null), [asset]);
  const history = useMemo(
    () => (id ? txs.filter((tx) => tx.assetId === id) : []),
    [id, txs],
  );

  if (!asset || !position) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()}>
          <Text style={type.meta}>Volver</Text>
        </Pressable>
        <Text style={type.pageTitle}>Inversión</Text>
        <Text style={type.body}>No está en el patrimonio.</Text>
      </Screen>
    );
  }

  async function savePrice() {
    if (!id) return;
    const next = parseAmount(price);
    if (next == null || busy) return;
    setBusy(true);
    try {
      await updateAsset(id, { price: next });
      setPrice("");
      triggerUiHaptic();
    } finally {
      setBusy(false);
    }
  }

  const up = position.pnl >= 0;

  return (
    <>
      <Screen>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={type.meta}>Patrimonio</Text>
        </Pressable>
        <Text style={type.pageTitle}>{asset.name}</Text>
        <Text style={type.meta}>
          {asset.ticker ? `${asset.ticker} · ` : ""}
          {ASSET_KIND_LABEL[asset.kind]}
        </Text>
        <Text style={styles.value}>{formatEuro(position.value)}</Text>
        <Text style={[styles.pnl, up ? styles.up : styles.down]}>
          {formatSignedEuro(position.pnl)} · {formatPct(position.pnlPct)}
        </Text>
        <View style={styles.stats}>
          <Stat label="Cantidad" value={asset.quantity.toLocaleString("es-ES")} />
          <Stat label="Precio" value={formatEuro(asset.price)} />
          <Stat label="Coste" value={formatEuro(asset.costBasis)} />
        </View>
        <Text style={type.label}>Actualizar precio</Text>
        <View style={styles.priceRow}>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Nuevo precio €"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Pressable
            onPress={() => void savePrice()}
            style={({ pressed }) => [styles.save, { opacity: busy || parseAmount(price) == null ? 0.4 : pressed ? 0.86 : 1 }]}
          >
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            triggerUiHaptic();
            setTxOpen(true);
          }}
          style={({ pressed }) => [styles.buy, { opacity: pressed ? 0.86 : 1 }]}
        >
          <Text style={styles.buyText}>Comprar o vender</Text>
        </Pressable>
        {history.length ? (
          <View style={styles.section}>
            <Text style={type.sectionTitle}>Movimientos</Text>
            <View style={txListStyle}>
              {history.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
      <TxComposerSheet open={txOpen} onOpenChange={setTxOpen} defaultKind="buy" />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { paddingTop: 8, paddingBottom: 4 },
  value: {
    fontFamily: fonts.sansBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
    paddingTop: 12,
  },
  pnl: { fontFamily: fonts.sansMedium, fontSize: 15, paddingTop: 4 },
  up: { color: colors.ok },
  down: { color: colors.danger },
  stats: { flexDirection: "row", gap: 12, paddingTop: 16, paddingBottom: 8 },
  stat: { flex: 1, gap: 4 },
  statValue: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  priceRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  save: {
    backgroundColor: colors.sheetRaised,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  buy: {
    marginTop: 8,
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  buyText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accentText },
  section: { gap: 8, paddingTop: 20 },
});
