import { space } from "@/lib/appearance/density";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field } from "./ui";

export function ExerciseComposer({ open, names, onClose, onAdd, initialName }: { open: boolean; names: string[]; onClose(): void; onAdd(name: string): void; initialName?: string }) {
  const { t } = useI18n(); const [name, setName] = useState("");
  useEffect(() => { if (open) setName(initialName ?? ""); }, [open, initialName]);
  function add(value: string) { if (value.trim()) { onAdd(value.trim()); onClose(); } }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} accessibilityCloseLabel={t("training.close")} viewportRatio={0.8}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(16) }}>
      <Text style={type.pageTitle}>{t(initialName ? "training.editExercise" : "training.addExercise")}</Text>
      <Field label={t("training.exerciseName")} placeholder={t("training.exerciseHint")} value={name} onChangeText={setName} maxLength={120} />
      <Button primary title={t(initialName ? "common.save" : "training.addExercise")} disabled={!name.trim()} onPress={() => add(name)} />
      {names.length ? <Text style={type.label}>{t("training.exerciseLibrary")}</Text> : null}
      <View style={{ gap: space(8) }}>{names.filter((value) => value.toLocaleLowerCase().includes(name.toLocaleLowerCase())).slice(0, 30).map((value) => <Button key={value} title={value} onPress={() => add(value)} />)}</View>
    </SheetScrollView>
  </BottomSheet>;
}
