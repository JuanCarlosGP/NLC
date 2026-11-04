import { space } from "@/lib/appearance/density";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useTraining } from "@/lib/health/training/training-context";
import { isDateKey, localDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field, errorKey, styles } from "./ui";

export function SessionComposer({ open, onClose, date }: { open: boolean; onClose(): void; date?: string }) {
  const router = useRouter(); const { t } = useI18n(); const { create } = useTraining();
  const [name, setName] = useState(""); const [day, setDay] = useState(date ?? localDateKey()); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setDay(date ?? localDateKey()); setError(null); } }, [open, date]);
  async function submit() {
    if (busy) return;
    if (!name.trim()) { setError("training.errors.name"); return; }
    if (!isDateKey(day)) { setError("training.errors.date"); return; }
    setBusy(true);
    try { const session = await create(name, day); onClose(); router.push(`/health/training/session/${session.id}`); }
    catch (err) { setError(errorKey(err)); } finally { setBusy(false); }
  }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }} accessibilityCloseLabel={t("training.close")} viewportRatio={0.7}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(16) }}>
      <Text style={type.pageTitle}>{t("training.new")}</Text>
      <Field label={t("training.name")} placeholder={t("training.nameHint")} value={name} onChangeText={setName} maxLength={120} editable={!busy} />
      <Field label={t("training.date")} placeholder="AAAA-MM-DD" value={day} onChangeText={setDay} maxLength={10} autoCapitalize="none" editable={!busy} />
      <Text style={type.meta}>{t("training.saveHint")}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      <Button primary title={t("training.create")} disabled={busy || !name.trim()} onPress={() => void submit()} />
    </SheetScrollView>
  </BottomSheet>;
}
