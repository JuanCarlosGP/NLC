import { space } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useBodyPhotos } from "@/lib/health/body-photos/body-context";
import { localDateKey } from "@/lib/health/weight/model";
import { BodyPhotoError, type BodyReview } from "@/lib/health/body-photos/model";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field, styles } from "../training/ui";

export function bodyErrorKey(error: unknown): string { return error instanceof BodyPhotoError ? `body.errors.${error.code}` : "body.storageError"; }
export function ReviewComposer({ open, entry, onClose, onSaved }: { open: boolean; entry: BodyReview | null; onClose(): void; onSaved(entry: BodyReview): void }) {
  const { t } = useI18n(); const { save } = useBodyPhotos(); const [date, setDate] = useState(localDateKey()); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const locked = useRef(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setDate(entry?.date ?? localDateKey()); setNote(entry?.note ?? ""); setError(null); } }, [open, entry]);
  async function submit() {
    if (locked.current) return; locked.current = true; setBusy(true); setError(null);
    try { const saved = await save(date.trim(), note, entry?.id); onSaved(saved); onClose(); }
    catch (err) { setError(bodyErrorKey(err)); } finally { locked.current = false; setBusy(false); }
  }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next && !locked.current) onClose(); }} accessibilityCloseLabel={t("body.close")} viewportRatio={0.75}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(16) }}>
      <Text style={type.pageTitle}>{t(entry ? "body.edit" : "body.new")}</Text>
      <Field label={t("body.date")} value={date} onChangeText={setDate} placeholder={t("health.dateHint")} maxLength={10} autoCapitalize="none" editable={!busy} />
      <Field label={t("body.note")} value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} />
      {!entry ? <Text style={type.meta}>{t("body.addHint")}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      <Button primary disabled={busy} title={t(busy ? "health.saving" : "common.save")} onPress={() => void submit()} />
    </SheetScrollView>
  </BottomSheet>;
}
