import { useThemeId } from "@/lib/appearance/use-theme-id";
import { densityData, space } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, View, type ScrollView } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useRouter } from "expo-router";
import { ArrowUpRight, Archive } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { healthBackup } from "@/lib/health/backup/service";
import { BackupError, type BackupInfo } from "@/lib/health/backup/model";
import { pickHealthBackup, saveHealthBackup } from "@/lib/health/backup/io";
import { useWeight } from "@/lib/health/weight/weight-context";
import { useTraining } from "@/lib/health/training/training-context";
import { useMedication } from "@/lib/health/medication/medication-context";
import { useNutrition } from "@/lib/health/nutrition/nutrition-context";
import { useBodyPhotos } from "@/lib/health/body-photos/body-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Header, styles } from "../training/ui";
const counts = ["weights", "sessions", "plans", "logs", "nutrition", "reviews", "photos"] as const;
function Counts({ info }: { info: Pick<BackupInfo, typeof counts[number]> }) {
  useThemeId(); const { t } = useI18n(); return <View {...densityData("backup-counts")} style={{ gap: space(8) }}>{counts.map((key) => <View style={styles.spread} key={key}><Text style={type.body}>{t(`healthBackup.${key}`)}</Text><Text style={type.body}>{info[key]}</Text></View>)}</View>; }
function filename(date: string) { return `nlc-health-${new Date(date).toISOString().replace(/[:.]/g, "-")}.zip`; }
export function HealthBackupHomeCard() {
  useThemeId(); const router = useRouter(); const { t } = useI18n(); return <Pressable accessibilityRole="button" onPress={() => router.push("/health/backup")} style={[styles.card, styles.row]}><Archive color={colors.accent} size={24} strokeWidth={1.6} /><View style={{ flex: 1, gap: space(5) }}><Text style={type.sectionTitle}>{t("healthBackup.open")}</Text><Text style={type.meta}>{t("healthBackup.hint")}</Text></View><ArrowUpRight color={colors.inkSoft} size={20} /></Pressable>; }
export function HealthBackupScreen() {
  useThemeId();
  const { t, locale } = useI18n(); const weights = useWeight(); const training = useTraining(); const medication = useMedication(); const nutrition = useNutrition(); const body = useBodyPhotos();
  const [selected, setSelected] = useState<{ name: string; bytes: Uint8Array; info: BackupInfo } | null>(null); const [previous, setPrevious] = useState<BackupInfo | null>(null); const [busy, setBusy] = useState<string | null>(null); const locked = useRef(false); const [confirm, setConfirm] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const scrollRef = useRef<ScrollView | null>(null); const previewScrolled = useRef(false);
  const lastBusy = useRef("refreshing"); if (busy) lastBusy.current = busy;
  const ready = weights.ready && training.ready && medication.ready && nutrition.ready && body.ready;
  const failed = weights.loadFailed || training.loadFailed || medication.loadFailed || nutrition.loadFailed || body.loadFailed;
  const current = { weights: weights.entries.length, sessions: training.sessions.length, plans: medication.data.plans.length, logs: medication.data.logs.length, nutrition: nutrition.entries.length, reviews: body.entries.length, photos: body.entries.reduce((sum, entry) => sum + Object.keys(entry.photos).length, 0) };
  const formatDate = (value: string) => new Date(value).toLocaleString(locale);
  function failure(err: unknown) { return t(err instanceof BackupError ? `healthBackup.errors.${err.code}` : err instanceof Error && /blocked/i.test(err.message) ? "healthBackup.errors.blocked" : "healthBackup.errors.storage"); }
  useEffect(() => { void healthBackup.recoveryInfo().then(setPrevious).catch((err) => setError(failure(err))); }, []);
  async function refreshAll() { await Promise.all([weights.refresh(), training.refresh(), medication.refresh(), nutrition.refresh(), body.refresh()]); }
  async function run(kind: string, task: () => Promise<void>) {
    if (locked.current) return; locked.current = true; setBusy(kind); setError(""); setMessage("");
    // Let the busy overlay paint before ZIP encoding/validation begins.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try { await training.flush(); await task(); } catch (err) { setError(failure(err)); } finally { locked.current = false; setBusy(null); }
  }
  function exportCurrent() { void run("exporting", async () => { const backup = await healthBackup.export(); if (await saveHealthBackup(backup.bytes, filename(backup.info.createdAt))) setMessage(t("healthBackup.exported")); }); }
  function choose(previousCopy = false) { void run("selecting", async () => {
    const picked = previousCopy ? { name: t("healthBackup.previous"), bytes: await healthBackup.recoveryBytes() } : await pickHealthBackup();
    if (!picked?.bytes) return; setSelected(null); previewScrolled.current = false; const info = await healthBackup.inspect(picked.bytes); setSelected({ name: picked.name, bytes: picked.bytes, info });
  }); }
  function restore() { setConfirm(false); if (!selected) return; const archive = selected.bytes; void run("restoring", async () => {
    const result = await healthBackup.restore(archive); setPrevious(result.recovery); setSelected(null); setBusy("refreshing");
    await refreshAll();
    try { await training.setRest(null); await medication.clearDeviceAlerts(); setMessage(t("healthBackup.restored")); }
    catch { setMessage(t("healthBackup.alertsWarning")); }
  }); }
  return <><Screen scrollRef={scrollRef}><Header title={t("healthBackup.title")} home />
    <View style={styles.card}><Text style={type.sectionTitle}>{t("healthBackup.current")}</Text>{!ready ? <Text style={type.meta}>{t("common.loading")}</Text> : failed ? <><Text accessibilityRole="alert" style={styles.error}>{t("healthBackup.errors.storage")}</Text><Button title={t("healthBackup.retry")} onPress={() => { void refreshAll(); void healthBackup.recoveryInfo().then(setPrevious).catch((err) => setError(failure(err))); }} /></> : <Counts info={current} />}</View>
    <Text style={type.meta}>{t("healthBackup.scope")}</Text><Text style={type.body}>{t("healthBackup.privacy")}</Text>
    <Button primary disabled={!ready || failed || !!busy} title={t("healthBackup.export")} onPress={exportCurrent} /><Button disabled={!ready || !!busy} title={t("healthBackup.import")} onPress={() => choose()} />
    {message ? <Text accessibilityLiveRegion="polite" style={[type.body, { color: colors.ok }]}>{message}</Text> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {selected ? <View key={selected.name + selected.info.createdAt} style={styles.card} onLayout={(event) => { if (!previewScrolled.current) { previewScrolled.current = true; scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 16), animated: true }); } }}><Text style={type.sectionTitle}>{t("healthBackup.preview")}</Text><Text style={type.body}>{selected.name}</Text><Text style={type.meta}>{t("healthBackup.exportedAt", { date: formatDate(selected.info.createdAt) })}</Text><Text style={type.meta}>{t("healthBackup.size", { size: (selected.info.bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 2 }) })}</Text><Counts info={selected.info} />
      <Text style={type.body}>{t("healthBackup.replace")}</Text><Text style={type.meta}>{t("healthBackup.recoveryHint")}</Text><Text style={type.meta}>{t("healthBackup.device")}</Text>
      <Button primary disabled={!!busy || failed} title={t("healthBackup.restore")} onPress={() => setConfirm(true)} /><Button disabled={!!busy} title={t("healthBackup.cancel")} onPress={() => setSelected(null)} />
    </View> : null}
    <View style={styles.card}><Text style={type.sectionTitle}>{t("healthBackup.previous")}</Text>{previous ? <><Text style={type.body}>{t("healthBackup.previousBody")}</Text><Text style={type.meta}>{t("healthBackup.exportedAt", { date: formatDate(previous.createdAt) })}</Text><Counts info={previous} /><Button disabled={!!busy} title={t("healthBackup.inspectPrevious")} onPress={() => choose(true)} /><Button disabled={!!busy} title={t("healthBackup.savePrevious")} onPress={() => void run("exporting", async () => { const bytes = await healthBackup.recoveryBytes(); if (!bytes) throw new BackupError("recovery"); if (await saveHealthBackup(bytes, filename(previous.createdAt))) setMessage(t("healthBackup.exported")); })} /></> : <Text style={type.meta}>{t("healthBackup.noPrevious")}</Text>}</View>

  </Screen>
    <ConfirmDialog open={confirm} title={t("healthBackup.confirmTitle")} message={t("healthBackup.confirmMessage")} confirmLabel={t("healthBackup.restore")} onConfirm={restore} onCancel={() => setConfirm(false)} />
    <Modal visible={!!busy} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}><View style={{ flex: 1, justifyContent: "center", padding: space(28), backgroundColor: "rgba(8,7,6,0.88)" }}><View style={styles.card}><ActivityIndicator color={colors.accent} /><Text style={type.sectionTitle}>{t(`healthBackup.${busy ?? lastBusy.current}`)}</Text><Text style={type.body}>{t("healthBackup.busyHint")}</Text></View></View></Modal>
  </>;
}
