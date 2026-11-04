import { useState } from "react";
import { Linking, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineHelp } from "@/components/ui/inline-help";
import { Button, Field } from "@/components/health/training/ui";
import { createStyles } from "@/lib/appearance/density";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useI18n } from "@/lib/i18n/context";
import { useIntegrations } from "@/lib/integrations/integrations-context";
import { mercuryExample } from "@/lib/integrations/mercury-demo";
import { MercuryError } from "@/lib/integrations/mercury-api";
import { parseSnapshot, type MercurySnapshot } from "@/lib/integrations/model";
import { pickIntegrationCopy, saveIntegrationCopy } from "@/lib/integrations/io";
import { colors, type } from "@/lib/theme";

export function MobileMercuryPanel() {
  useThemeId();
  const ctx = useIntegrations(); const { t, locale } = useI18n();
  const [setup, setSetup] = useState(false); const [token, setToken] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [working, setWorking] = useState(false); const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"clear" | "disconnect" | null>(null);
  const [imported, setImported] = useState<MercurySnapshot | null>(null);
  const connection = ctx.mobileMercury;
  if (!connection) return null;
  const { state } = connection; const mode = ctx.selection.mercury;
  const data = ctx.copies.mercury[mode];
  const disabled = working || state.busy || !ctx.ready || !state.ready;
  const lastSync = data ? new Date(data.syncedAt).toLocaleString(locale) : null;
  const errorCode = error || state.error || ctx.error;
  const errorLabel = errorCode ? t(`mobileMercury.errors.${errorCode}`) : "";
  async function run(operation: () => Promise<unknown>) {
    if (working) return;
    setWorking(true); setError("");
    try { await operation(); }
    catch (error) { setError(error instanceof MercuryError ? error.code : error instanceof Error && ["invalid", "size", "storage"].includes(error.message) ? error.message : "storage"); }
    finally { setWorking(false); }
  }
  async function acceptImport(value: MercurySnapshot) { await ctx.save(value); await ctx.select("mercury", value.mode); }
  const summary = !state.ready ? t("common.loading") : !state.configured ? t("mobileMercury.notConfigured") : state.error === "auth" ? t("mobileMercury.accessExpired") : t("mobileMercury.configured");
  return <View style={styles.section}>
    <View style={styles.row}>{(["live", "demo"] as const).map(value => <Button key={value}
      title={t(`integrations.${value}`)} primary={mode === value} disabled={disabled}
      onPress={() => void run(() => ctx.select("mercury", value))} />)}</View>
    <View style={styles.card}>
      <Text style={type.body}>{mode === "demo" ? t("integrations.demo") : summary}</Text>
      <Text style={type.meta}>{lastSync ? t("integrations.lastSync", { date: lastSync }) : t("integrations.empty")}</Text>
      {mode === "live" ? <>
        <View style={styles.row}>
          <Button title={t(state.busy ? "integrations.syncing" : "integrations.sync")} primary disabled={disabled || !state.configured}
            onPress={() => void run(() => connection.sync())} />
          <Button title={t(state.configured ? "mobileMercury.changeToken" : "mobileMercury.configure")} disabled={disabled}
            onPress={() => { setToken(""); setError(""); setSetup(true); }} />
          {state.configured ? <Button title={t("mobileMercury.disconnect")} disabled={disconnecting} onPress={() => setConfirmation("disconnect")} /> : null}
        </View>
        {state.configured ? <Text style={type.meta}>{t("mobileMercury.automatic")}</Text> : null}
        {state.retryAt > Date.now() && state.error && !["auth", "storage", "accountChanged"].includes(state.error) ?
          <Text style={type.meta}>{t("mobileMercury.retryAt", { time: new Date(state.retryAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })}</Text> : null}
        {state.error === "storage" ? <Button title={t("integrations.retry")} disabled={disabled} onPress={() => void run(() => connection.retryStorage())} /> : null}
      </> : <Button title={t("integrations.example")} disabled={disabled} onPress={() => void run(() => acceptImport(mercuryExample()))} />}
      {data ? <Text style={type.meta}>{t("integrations.localHint")}</Text> : null}
    </View>
    {errorLabel ? <Text accessibilityRole="alert" style={styles.error}>{errorLabel}</Text> : null}
    <InlineHelp label={t("integrations.copies")}><View style={styles.section}>
      <Text style={type.meta}>{t("integrations.copiesHint")}</Text>
      <View style={styles.row}>
        <Button title={t("integrations.export")} disabled={disabled || !data} onPress={() => void run(async () => {
          if (data) await saveIntegrationCopy(JSON.stringify(data, null, 2), `nlc-mercury-${mode}-${new Date(data.syncedAt).toISOString().slice(0, 10)}.json`);
        })} />
        <Button title={t("integrations.import")} disabled={disabled} onPress={() => void run(async () => {
          const text = await pickIntegrationCopy(); if (text !== null) setImported(parseSnapshot(text, "mercury") as MercurySnapshot);
        })} />
        <Button title={t("integrations.clear")} disabled={disabled || !data} danger onPress={() => setConfirmation("clear")} />
      </View>
    </View></InlineHelp>
    <BottomSheet open={setup} onOpenChange={open => { if (!working) { setSetup(open); if (!open) setToken(""); } }} viewportRatio={0.68}>
      <SheetScrollView contentContainerStyle={styles.setup}>
        <Text style={type.sectionTitle}>{t("mobileMercury.configure")}</Text>
        <Field label={t("mobileMercury.token")} value={token} onChangeText={setToken} secureTextEntry
          autoCorrect={false} autoCapitalize="none" autoComplete="off" textContentType="none" maxLength={1800} editable={!working}
          importantForAutofill="noExcludeDescendants" />
        <Text style={type.meta}>{t("mobileMercury.tokenHelp")}</Text>
        <Button title={t("mobileMercury.tokenInstructions")} disabled={working} onPress={() => void Linking.openURL("https://docs.mercury.com/docs/getting-started").catch(() => setError("network"))} />
        {errorLabel ? <Text accessibilityRole="alert" style={styles.error}>{errorLabel}</Text> : null}
        <Button title={t(working ? "integrations.busy" : "mobileMercury.saveToken")} primary disabled={working || !token.trim()} onPress={() => void run(async () => {
          await connection.configure(token); setToken(""); setSetup(false); await ctx.select("mercury", "live"); await connection.sync();
        })} />
      </SheetScrollView>
    </BottomSheet>
    <ConfirmDialog open={!!state.pending} title={t("mobileMercury.accountChangedTitle")} destructive={false} busy={disabled}
      message={t("mobileMercury.accountChangedBody", { accounts: state.pending?.accounts.slice(0, 3).map(value => `${value.name.slice(0, 60)}${value.last4 ? ` · •${value.last4}` : ""}`).join(", ") || "Mercury" })}
      confirmLabel={t("integrations.replace")} onCancel={connection.rejectPending} onConfirm={() => void run(connection.acceptPending)} />
    <ConfirmDialog open={!!imported} title={t("integrations.replaceTitle")} message={t("integrations.replaceBody", { provider: "Mercury" })}
      confirmLabel={t("integrations.replace")} busy={disabled} onCancel={() => setImported(null)} onConfirm={() => {
        const value = imported; if (value) void run(async () => { await acceptImport(value); setImported(null); });
      }} />
    <ConfirmDialog open={!!confirmation} title={t(confirmation === "disconnect" ? "mobileMercury.disconnectTitle" : "integrations.clearTitle")}
      message={t(confirmation === "disconnect" ? "mobileMercury.disconnectBody" : mode === "live" && state.configured ? "mobileMercury.clearConnectedBody" : "mobileMercury.clearBody")}
      confirmLabel={t(confirmation === "disconnect" ? "mobileMercury.disconnect" : "integrations.clear")} busy={confirmation === "disconnect" ? disconnecting : working}
      onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (confirmation === "disconnect") {
          setDisconnecting(true); setError("");
          void connection.disconnect().then(() => setConfirmation(null)).catch(() => setError("storage")).finally(() => setDisconnecting(false));
        } else void run(async () => { await ctx.clear("mercury", mode); setConfirmation(null); });
      }} />
  </View>;
}
const styles = createStyles(() => ({
  section: { gap: 12 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { padding: 16, gap: 12, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet, borderRadius: 14 },
  setup: { paddingHorizontal: 22, paddingBottom: 28, gap: 12 }, error: { ...type.body, color: colors.danger },
}));
