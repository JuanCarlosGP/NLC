import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { AmountInput } from "@/components/wealth/amount-input";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { WealthChart } from "@/components/wealth/wealth-chart";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { dateLocale, t as tr } from "@/lib/i18n/runtime";
import { amountPlaceholder, formatAmountInput, formatEuro, formatPct, formatSignedEuro, parseAmount, roundMoney } from "@/lib/wealth/money";
import { assetHistory, assetSeries, changePct, parseBookedDay } from "@/lib/wealth/compute";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";
import {
  ACCOUNT_KIND_LABEL,
  ACCOUNT_KINDS,
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  type WealthAccount,
  type WealthAccountKind,
  type WealthAsset,
  type WealthAssetKind,
  type WealthTxKind,
} from "@/lib/wealth/types";

export function AccountComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} accessibilityCloseLabel={t("wealth.closeAccount")} viewportRatio={0.62}>
      <AccountComposerBody open={open} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function AccountComposerBody({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useI18n();
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
      <Text style={type.sectionTitle}>{t("wealth.newAccount")}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("wealth.accountPlaceholder")}
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
        <Text style={styles.submitText}>{busy ? "…" : t("common.create")}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

export function CashComposerSheet({
  account,
  onOpenChange,
}: {
  account: WealthAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={account != null}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("wealth.closeCash")}
      viewportRatio={0.52}
    >
      {account ? <CashComposerBody account={account} onDone={() => onOpenChange(false)} /> : null}
    </BottomSheet>
  );
}

function CashComposerBody({ account, onDone }: { account: WealthAccount; onDone: () => void }) {
  const { t } = useI18n();
  const { createTx, balanceOf } = useWealth();
  const cash = balanceOf(account.id);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(formatAmountInput(cash));
    setBusy(false);
    setError(null);
  }, [account.id, cash]);

  const parsed = parseAmount(amount);
  const canSave = parsed != null;

  async function submit() {
    if (!canSave || parsed == null || busy) return;
    const delta = roundMoney(parsed - cash);
    if (Math.abs(delta) < 0.005) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTx({
        kind: delta > 0 ? "income" : "expense",
        amount: Math.abs(delta),
        title: tr("wealth.adjustment"),
        category: "Otro",
        accountId: account.id,
      });
      triggerUiHaptic();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wealth.saveFail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.sectionTitle}>{t("wealth.editCash")}</Text>
      <Text style={type.meta}>{account.name}</Text>
      <Text style={type.label}>{t("wealth.balance")}</Text>
      <AmountInput
        value={amount}
        onChangeText={setAmount}
        placeholder={amountPlaceholder()}
        accessibilityLabel={t("wealth.cashA11y")}
        style={styles.input}
      />
      {error ? <Text style={styles.removeText}>{error}</Text> : null}
      <Pressable
        disabled={!canSave || busy}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.submit, { opacity: !canSave || busy ? 0.4 : pressed ? 0.86 : 1 }]}
      >
        <Text style={styles.submitText}>{busy ? "…" : t("common.save")}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

export function AssetComposerSheet({
  open,
  onOpenChange,
  asset,
  defaultAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: WealthAsset | null;
  defaultAccountId?: string | null;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("wealth.closeAsset")}
      viewportRatio={0.86}
    >
      <AssetComposerBody
        open={open}
        asset={asset ?? null}
        defaultAccountId={defaultAccountId}
        onDone={() => onOpenChange(false)}
      />
    </BottomSheet>
  );
}

function AssetComposerBody({
  open,
  asset,
  defaultAccountId,
  onDone,
}: {
  open: boolean;
  asset: WealthAsset | null;
  defaultAccountId?: string | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { createAsset, updateAsset, createQuote, deleteQuote, assets, quotes, txs } = useWealth();
  const accounts = useLiveAccounts();
  const current = asset ? (assets.find((item) => item.id === asset.id) ?? asset) : null;
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [kind, setKind] = useState<WealthAssetKind>("stock");
  const [accountId, setAccountId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropQuote, setDropQuote] = useState<string | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<WealthTxKind>("buy");

  useEffect(() => {
    if (!open) return;
    setName(asset?.name ?? "");
    setTicker(asset?.ticker ?? "");
    setKind(asset?.kind ?? "stock");
    setAccountId(asset?.accountId ?? defaultAccountId ?? "");
    setQty(asset ? formatAmountInput(asset.quantity > 0.00000001 ? asset.quantity : 1, 8) : "");
    setPrice(asset ? formatAmountInput(asset.price) : "");
    setCost(asset ? formatAmountInput(asset.costBasis) : "");
    setDay("");
    setBusy(false);
    setConfirmDelete(false);
    setDropQuote(null);
    setTxOpen(false);
  }, [asset, defaultAccountId, open]);

  const parsedQty = parseAmount(qty, 8);
  const parsedPrice = parseAmount(price);
  const parsedCost = parseAmount(cost);
  const canSave = Boolean(name.trim()) && (!asset || parsedPrice != null);
  const history = useMemo(
    () => (current ? assetHistory(current, quotes, txs) : []),
    [current, quotes, txs],
  );
  const points = useMemo(
    () => (current ? assetSeries(current, quotes, txs, "max") : []),
    [current, quotes, txs],
  );
  const historyChange = changePct(points);
  const historyUp = (historyChange ?? 0) >= 0;
  const quoteAt = parseBookedDay(day);
  const canQuote = parsedPrice != null && parsedPrice > 0 && quoteAt != null;

  async function submit() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const unit = parsedPrice ?? 0;
      const quantity = parsedQty != null && parsedQty > 0.00000001 ? parsedQty : unit > 0.004 ? 1 : 0;
      const costBasis = parsedCost ?? quantity * unit;
      if (asset) {
        await updateAsset(asset.id, {
          name,
          ticker,
          kind,
          accountId: accountId || null,
          quantity,
          price: unit,
          costBasis,
        });
      } else {
        await createAsset({
          name,
          ticker,
          kind,
          accountId: accountId || null,
          quantity,
          price: unit,
          costBasis,
        });
      }
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function registerQuote() {
    if (!asset || !canQuote || quoteAt == null || busy) return;
    setBusy(true);
    try {
      await createQuote({ assetId: asset.id, price: parsedPrice!, bookedAt: quoteAt });
      setDay("");
      triggerUiHaptic();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.sectionTitle}>{asset ? t("wealth.editAsset") : t("wealth.newAsset")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("wealth.assetPlaceholder")}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={ticker}
          onChangeText={setTicker}
          placeholder={t("wealth.tickerShort")}
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
        <Text style={type.label}>{t("wealth.account")}</Text>
        <View style={styles.chips}>
          <Pressable
            onPress={() => {
              triggerUiHaptic();
              setAccountId("");
            }}
            style={[styles.chip, !accountId && styles.chipOn]}
          >
            <Text style={[styles.chipLabel, !accountId && styles.chipLabelOn]}>{t("wealth.accountNone")}</Text>
          </Pressable>
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
        <Text style={type.label}>{t("wealth.quantityA11y")}</Text>
        <AmountInput
          value={qty}
          onChangeText={setQty}
          decimals={8}
          placeholder={t("wealth.quantityEmpty")}
          accessibilityLabel={t("wealth.quantityA11y")}
          style={styles.input}
        />
        <Text style={type.label}>{t("wealth.priceA11y")}</Text>
        <AmountInput
          value={price}
          onChangeText={setPrice}
          placeholder={amountPlaceholder(25)}
          accessibilityLabel={t("wealth.priceA11y")}
          style={styles.input}
        />
        {asset ? (
          <>
            <Text style={type.label}>{t("wealth.costA11y")}</Text>
            <AmountInput
              value={cost}
              onChangeText={setCost}
              placeholder={amountPlaceholder(50)}
              accessibilityLabel={t("wealth.costA11y")}
              style={styles.input}
            />
            <Text style={type.label}>{t("wealth.quoteDate")}</Text>
            <TextInput
              value={day}
              onChangeText={setDay}
              placeholder={t("wealth.quoteDatePlaceholder")}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              disabled={!canQuote || busy}
              onPress={() => void registerQuote()}
              style={({ pressed }) => [
                styles.secondary,
                { opacity: !canQuote || busy ? 0.4 : pressed ? 0.86 : 1 },
              ]}
            >
              <Text style={styles.secondaryText}>{busy ? "…" : t("wealth.recordValue")}</Text>
            </Pressable>
            <View style={styles.chips}>
              <Pressable
                onPress={() => {
                  triggerUiHaptic();
                  setTxKind("buy");
                  setTxOpen(true);
                }}
                style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.86 : 1 }]}
              >
                <Text style={styles.chipLabel}>{t("wealth.contribute")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerUiHaptic();
                  setTxKind("sell");
                  setTxOpen(true);
                }}
                style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.86 : 1 }]}
              >
                <Text style={styles.chipLabel}>{t("wealth.sellChip")}</Text>
              </Pressable>
            </View>
            {points.length >= 2 ? (
              <View style={styles.historyHead}>
                <Text style={type.sectionTitle}>{t("wealth.evolution")}</Text>
                <Text style={[styles.chg, historyUp ? styles.up : styles.down]}>{formatPct(historyChange)}</Text>
              </View>
            ) : (
              <Text style={type.sectionTitle}>{t("wealth.history")}</Text>
            )}
            {points.length >= 2 ? (
              <WealthChart points={points} up={historyUp} range="max" height={112} fromZero={false} />
            ) : null}
            {history.length ? (
              <View>
                {history.map((item) => {
                  const date = new Date(item.at).toLocaleDateString(dateLocale(), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  const title =
                    item.kind === "quote"
                      ? t("wealth.value")
                      : item.kind === "buy"
                        ? t("wealth.contribution")
                        : t("wealth.sale");
                  const unit =
                    item.price != null
                      ? item.quantity != null && item.quantity > 0.00000001 && Math.abs(item.quantity - 1) > 0.00000001
                        ? `${item.quantity} × ${formatEuro(item.price)}`
                        : formatEuro(item.price)
                      : null;
                  const signed =
                    item.kind === "buy" ? -(item.amount ?? 0) : item.kind === "sell" ? (item.amount ?? 0) : null;
                  return (
                    <Pressable
                      key={item.id}
                      delayLongPress={350}
                      onLongPress={
                        item.kind === "quote"
                          ? () => {
                              triggerUiHaptic();
                              setDropQuote(item.id);
                            }
                          : undefined
                      }
                      style={({ pressed }) => [styles.eventRow, { opacity: pressed ? 0.72 : 1 }]}
                    >
                      <View style={styles.eventMeta}>
                        <Text style={styles.eventTitle}>{title}</Text>
                        <Text style={styles.eventSub}>{[unit, date].filter(Boolean).join(" · ")}</Text>
                      </View>
                      <Text
                        style={[
                          styles.eventValue,
                          signed != null && signed > 0 ? styles.up : signed != null && signed < 0 ? styles.down : null,
                        ]}
                      >
                        {signed != null ? formatSignedEuro(signed) : formatEuro(item.value)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={type.body}>{t("wealth.assetHistoryHint")}</Text>
            )}
          </>
        ) : null}
        <Pressable
          disabled={!canSave || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, { opacity: !canSave || busy ? 0.4 : pressed ? 0.86 : 1 }]}
        >
          <Text style={styles.submitText}>{busy ? "…" : asset ? t("common.save") : t("wealth.add")}</Text>
        </Pressable>
        {asset ? (
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
        title={t("wealth.deleteAsset")}
        message={asset ? t("wealth.hideAssetMessage", { name: asset.name }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!asset) return;
          void (async () => {
            setBusy(true);
            await updateAsset(asset.id, { archived: true });
            setBusy(false);
            setConfirmDelete(false);
            onDone();
          })();
        }}
      />
      <ConfirmDialog
        open={dropQuote != null}
        title={t("wealth.deleteQuote")}
        message={t("wealth.deleteQuoteMessage")}
        confirmLabel={t("chat.clearConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setDropQuote(null);
        }}
        onConfirm={() => {
          if (!dropQuote) return;
          void (async () => {
            setBusy(true);
            await deleteQuote(dropQuote);
            setBusy(false);
            setDropQuote(null);
          })();
        }}
      />
      {asset ? (
        <TxComposerSheet
          open={txOpen}
          onOpenChange={setTxOpen}
          defaultKind={txKind}
          defaultAssetId={asset.id}
        />
      ) : null}
    </>
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
  remove: { alignItems: "center", paddingVertical: 8 },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.danger },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: colors.sheetRaised,
  },
  secondaryText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  historyHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  chg: { fontFamily: fonts.sansMedium, fontSize: 14 },
  up: { color: colors.ok },
  down: { color: colors.danger },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  eventMeta: { flex: 1, gap: 2 },
  eventTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  eventSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  eventValue: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
});
