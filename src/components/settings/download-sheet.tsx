import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import type { useDownloadSettings } from "@/hooks/use-download-settings";
import type { DownloadMediaKind } from "@/lib/podcasts/downloader";
import { colors, fonts, type } from "@/lib/theme";

type DownloadHook = ReturnType<typeof useDownloadSettings>;

const KIND_OPTIONS: { id: DownloadMediaKind; label: string; hint: string }[] = [
  { id: "song", label: "Canción", hint: "Music/Canciones" },
  { id: "podcast", label: "Podcast", hint: "Music/Podcasts" },
];

export function DownloadSheet({
  open,
  onOpenChange,
  download,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: DownloadHook;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar descargas"
      viewportRatio={0.9}
    >
      <DownloadSheetBody download={download} />
    </BottomSheet>
  );
}

function DownloadSheetBody({ download }: { download: DownloadHook }) {
  const { settings, setSettings, token, setToken, busy, feedback, job, persist, testConnection, enqueue } =
    download;
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<DownloadMediaKind>("song");

  async function onEnqueue() {
    try {
      await enqueue(url, kind);
      setUrl("");
    } catch {
      // feedback already set
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.label}>Descargas</Text>
      <Text style={type.pageTitle}>yt-dlp</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Activar</Text>
        <Switch
          value={settings.enabled}
          onValueChange={(enabled) => setSettings({ ...settings, enabled })}
          trackColor={{ false: colors.rule, true: colors.accent }}
          thumbColor={colors.ink}
        />
      </View>

      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field
            label="Host"
            value={settings.host}
            onChange={(host) => setSettings({ ...settings, host })}
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.pairItem, styles.port]}>
          <Field
            label="Puerto"
            value={settings.port}
            onChange={(port) => setSettings({ ...settings, port })}
            keyboardType="number-pad"
          />
        </View>
      </View>
      <Field
        label="Token (opcional)"
        value={token}
        onChange={setToken}
        secure
        autoCapitalize="none"
        placeholder="Vacío si AUTH_TOKEN está vacío"
      />

      <View style={styles.actions}>
        <Pressable
          onPress={() => void testConnection()}
          disabled={busy || !settings.enabled}
          style={({ pressed }) => [
            styles.btn,
            styles.btnGhost,
            { opacity: busy || !settings.enabled ? 0.55 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.btnGhostText}>{busy ? "…" : "Probar"}</Text>
        </Pressable>
        <Pressable
          onPress={() => void persist()}
          disabled={busy}
          style={({ pressed }) => [styles.btn, styles.btnSolid, { opacity: pressed || busy ? 0.7 : 1 }]}
        >
          <Text style={styles.btnSolidText}>Guardar</Text>
        </Pressable>
      </View>

      <Text style={type.label}>URL</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://www.youtube.com/watch?v=…"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => void onEnqueue()}
        returnKeyType="go"
        editable={settings.enabled && !busy}
        style={styles.input}
      />

      <Text style={type.label}>Tipo</Text>
      <View style={styles.kindRow}>
        {KIND_OPTIONS.map((option) => {
          const active = kind === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setKind(option.id)}
              disabled={busy}
              style={[styles.kindChip, active && styles.kindChipActive]}
            >
              <Text style={[styles.kindLabel, active && styles.kindLabelActive]}>{option.label}</Text>
              <Text style={[styles.kindHint, active && styles.kindHintActive]}>{option.hint}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => void onEnqueue()}
        disabled={busy || !settings.enabled || !url.trim()}
        style={({ pressed }) => [
          styles.enqueueBtn,
          {
            opacity: busy || !settings.enabled || !url.trim() ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.enqueueText}>{busy ? "Trabajando…" : "Descargar al NAS"}</Text>
      </Pressable>

      {job ? (
        <View style={styles.logBox}>
          <Text style={type.label}>Log</Text>
          {job.progress != null ? (
            <Text style={styles.logMeta}>
              {Math.round(job.progress)}%
              {job.speed ? ` · ${job.speed}` : ""}
              {job.eta ? ` · ETA ${job.eta}` : ""}
            </Text>
          ) : (
            <Text style={styles.logMeta}>
              Job {job.id} · {job.status}
              {job.resolvedKind ? ` · ${job.resolvedKind}` : ""}
            </Text>
          )}
          <Text style={styles.logText}>{(job.log ?? []).join("\n") || "—"}</Text>
        </View>
      ) : null}
      {feedback ? <Text style={[type.body, { color: feedback.color }]}>{feedback.text}</Text> : null}
    </SheetScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
  keyboardType?: "number-pad" | "default";
  autoCapitalize?: "none" | "sentences";
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 96,
    gap: 12,
  },
  field: { gap: 6 },
  pair: { flexDirection: "row", gap: 10 },
  pairItem: { flex: 1 },
  port: { maxWidth: 110 },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  actions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 8,
  },
  btnGhost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  btnSolid: { backgroundColor: colors.accent },
  btnGhostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  btnSolidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kindChip: {
    flexGrow: 1,
    flexBasis: "30%",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
    backgroundColor: colors.sheet,
  },
  kindChipActive: {
    borderColor: colors.ruleLight,
    backgroundColor: colors.sheetRaised,
  },
  kindLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.muted },
  kindLabelActive: { color: colors.ink },
  kindHint: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
  kindHintActive: { color: colors.inkSoft },
  enqueueBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.sheetRaised,
    borderWidth: 1,
    borderColor: colors.ruleLight,
  },
  enqueueText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink },
  logBox: {
    gap: 6,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    minHeight: 120,
    marginBottom: 24,
  },
  logMeta: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.inkSoft },
  logText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
});
