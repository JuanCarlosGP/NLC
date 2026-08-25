import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { AmountInput } from "@/components/wealth/amount-input";
import { formatAmountInput, parseAmount } from "@/lib/wealth/money";
import { useTxActions } from "@/lib/wealth/tx-actions-context";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";
import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  CASH_ACCOUNT_ID,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TX_KIND_LABEL,
  TX_KINDS,
  type WealthAssetKind,
  type WealthTx,
  type WealthTxKind,
} from "@/lib/wealth/types";

export function TxActionsSheet() {
  const { open, tx, setOpen } = useTxActions();
  return <TxComposerSheet open={open} onOpenChange={setOpen} tx={tx} />;
}

export function TxComposerSheet({
  open,
  onOpenChange,
  defaultKind = "income",
  tx,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: WealthTxKind;
  tx?: WealthTx | null;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar movimiento"
      viewportRatio={0.86}
    >
      <TxComposerBody
        open={open}
        defaultKind={defaultKind}
        tx={tx ?? null}
        onDone={() => onOpenChange(false)}
      />
    </BottomSheet>
  );
}

function TxComposerBody({
  open,
  defaultKind,
  tx,
  onDone,
}: {
  open: boolean;
  defaultKind: WealthTxKind;
  tx: WealthTx | null;
  onDone: () => void;
}) {
  const { createTx, updateTx, deleteTx, assets } = useWealth();
  const accounts = useLiveAccounts();
  const liveAssets = useMemo(() => {
    const list = assets.filter((item) => !item.archived);
    if (tx?.assetId && !list.some((item) => item.id === tx.assetId)) {
      const hidden = assets.find((item) => item.id === tx.assetId);
      if (hidden) return [hidden, ...list];
    }
    return list;
  }, [assets, tx]);
  const [kind, setKind] = useState<WealthTxKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState(CASH_ACCOUNT_ID);
  const [counterId, setCounterId] = useState<string>("");
  const [assetId, setAssetId] = useState<string>("");
  const [assetName, setAssetName] = useState("");
  const [assetKind, setAssetKind] = useState<WealthAssetKind>("stock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (tx) {
      setKind(tx.kind);
      setTitle(tx.title);
      setAmount(formatAmountInput(tx.amount));
      setQuantity(tx.quantity != null ? formatAmountInput(tx.quantity, 8) : "");
      setCategory(tx.category ?? "");
      setAccountId(tx.accountId ?? accounts[0]?.id ?? CASH_ACCOUNT_ID);
      setCounterId(tx.counterAccountId ?? accounts.find((item) => item.id !== tx.accountId)?.id ?? "");
      setAssetId(tx.assetId ?? "");
      setAssetName("");
      setAssetKind(assets.find((item) => item.id === tx.assetId)?.kind ?? "stock");
      setBusy(false);
      setError(null);
      setConfirmDelete(false);
      return;
    }
    setKind(defaultKind);
    setTitle("");
    setAmount("");
    setQuantity("");
    setCategory("");
    setAccountId(accounts[0]?.id ?? CASH_ACCOUNT_ID);
    setCounterId(accounts[1]?.id ?? "");
    setAssetId("");
    setAssetName("");
    setAssetKind("stock");
    setBusy(false);
    setError(null);
    setConfirmDelete(false);
  }, [defaultKind, open, tx]);

  const categories = kind === "income" ? INCOME_CATEGORIES : kind === "expense" ? EXPENSE_CATEGORIES : [];
  const parsedAmount = parseAmount(amount);
  const parsedQty = parseAmount(quantity, 8);
  const canSubmit =
    Boolean(title.trim()) &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    (kind !== "transfer" || (accountId && counterId && accountId !== counterId)) &&
    (kind !== "sell" || Boolean(assetId));

  async function submit() {
    if (!canSubmit || parsedAmount == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        kind,
        amount: parsedAmount,
        title,
        category,
        accountId: kind === "transfer" ? accountId : accountId,
        counterAccountId: kind === "transfer" ? counterId : null,
        assetId: kind === "buy" || kind === "sell" ? assetId || null : null,
        quantity: kind === "buy" || kind === "sell" ? parsedQty : null,
        unitPrice:
          (kind === "buy" || kind === "sell") && parsedQty && parsedQty > 0
            ? parsedAmount / parsedQty
            : null,
        assetName: kind === "buy" ? assetName : undefined,
        assetKind: kind === "buy" ? assetKind : undefined,
        bookedAt: tx?.bookedAt,
        notes: tx?.notes,
      };
      if (tx) await updateTx(tx.id, input);
      else await createTx(input);
      triggerUiHaptic();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.sectionTitle}>{tx ? "Editar movimiento" : "Movimiento"}</Text>
        <View style={styles.chips}>
          {TX_KINDS.map((id) => {
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
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{TX_KIND_LABEL[id]}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={kind === "buy" ? "Nombre de la inversión" : "Concepto"}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <AmountInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Importe, 12,50 o 1.234,56"
          accessibilityLabel="Importe"
          style={styles.input}
        />
        {kind === "buy" || kind === "sell" ? (
          <AmountInput
            value={quantity}
            onChangeText={setQuantity}
            decimals={8}
            placeholder="Cantidad, 2 o 0,5"
            accessibilityLabel="Cantidad"
            style={styles.input}
          />
        ) : null}
        {kind === "buy" && !assetId ? (
          <>
            <TextInput
              value={assetName}
              onChangeText={setAssetName}
              placeholder="Ticker o nombre (opcional)"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              style={styles.input}
            />
            <View style={styles.chips}>
              {ASSET_KINDS.map((id) => {
                const active = assetKind === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      triggerUiHaptic();
                      setAssetKind(id);
                    }}
                    style={[styles.chip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{ASSET_KIND_LABEL[id]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {kind === "buy" || kind === "sell" ? (
          <>
            <Text style={type.label}>Inversión</Text>
            <View style={styles.chips}>
              {kind === "buy" ? (
                <Pressable
                  onPress={() => {
                    triggerUiHaptic();
                    setAssetId("");
                  }}
                  style={[styles.chip, !assetId && styles.chipOn]}
                >
                  <Text style={[styles.chipLabel, !assetId && styles.chipLabelOn]}>Nueva</Text>
                </Pressable>
              ) : null}
              {liveAssets.map((asset) => {
                const active = assetId === asset.id;
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => {
                      triggerUiHaptic();
                      setAssetId(asset.id);
                      if (!title.trim()) setTitle(asset.name);
                    }}
                    style={[styles.chip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>
                      {asset.ticker || asset.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {kind !== "transfer" ? (
          <>
            <Text style={type.label}>Cuenta</Text>
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
          </>
        ) : (
          <>
            <Text style={type.label}>Desde</Text>
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
            <Text style={type.label}>Hacia</Text>
            <View style={styles.chips}>
              {accounts
                .filter((account) => account.id !== accountId)
                .map((account) => {
                  const active = counterId === account.id;
                  return (
                    <Pressable
                      key={account.id}
                      onPress={() => {
                        triggerUiHaptic();
                        setCounterId(account.id);
                      }}
                      style={[styles.chip, active && styles.chipOn]}
                    >
                      <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{account.name}</Text>
                    </Pressable>
                  );
                })}
            </View>
          </>
        )}
        {categories.length ? (
          <>
            <Text style={type.label}>Categoría</Text>
            <View style={styles.chips}>
              {categories.map((item) => {
                const active = category === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      triggerUiHaptic();
                      setCategory(item);
                    }}
                    style={[styles.chip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, { opacity: !canSubmit || busy ? 0.4 : pressed ? 0.86 : 1 }]}
        >
          <Text style={styles.submitText}>{busy ? "…" : "Guardar"}</Text>
        </Pressable>
        {tx ? (
          <Pressable
            onPress={() => {
              triggerUiHaptic();
              setConfirmDelete(true);
            }}
            style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.removeText}>Eliminar</Text>
          </Pressable>
        ) : null}
      </SheetScrollView>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar movimiento"
        message={tx ? `Se borra «${tx.title}» y se deshace su efecto en caja e inversiones.` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!tx) return;
          void (async () => {
            setBusy(true);
            try {
              await deleteTx(tx.id);
              setConfirmDelete(false);
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo eliminar.");
              setConfirmDelete(false);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipLabelOn: { color: colors.void },
  error: { ...type.body, color: colors.danger },
  submit: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  submitText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accentText,
  },
  remove: { alignItems: "center", paddingVertical: 8 },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.danger },
});
