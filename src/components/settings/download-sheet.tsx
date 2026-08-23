import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Check, Copy, Info } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import type { useDownloadSettings } from "@/hooks/use-download-settings";
import type { DownloadMediaKind } from "@/lib/podcasts/downloader";
import type { AppZone } from "@/lib/zone/zone-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const YTDLP_COMPOSE = `services:
  podcast-downloader:
    image: python:3.12-slim
    container_name: snd-podcast-downloader
    working_dir: /app
    restart: unless-stopped
    ports:
      - "8091:8091"
    environment:
      LIBRARY_DIR: /library
      PODCAST_DIR: /library/Podcasts
      SONG_DIR: /library
      VIDEO_DIR: /video
      BIND_HOST: 0.0.0.0
      BIND_PORT: "8091"
      AUTH_TOKEN: ""
      MAX_WORKERS: "2"
    volumes:
      - /volume1/Music/snd-downloader-app:/app
      - /volume1/Music:/library
      - /volume1/Popcorn:/video
    command:
      - bash
      - -lc
      - |
        apt-get update
        apt-get install -y --no-install-recommends ffmpeg ca-certificates
        pip install --no-cache-dir -r requirements.txt
        exec python app.py
`;

type DownloadHook = ReturnType<typeof useDownloadSettings>;

const KIND_OPTIONS: { id: DownloadMediaKind; label: string; hint: string }[] = [
  { id: "song", label: "Canción", hint: "Music/Canciones" },
  { id: "podcast", label: "Podcast", hint: "Music/Podcasts" },
  { id: "video", label: "Vídeo", hint: "Popcorn/movies" },
];

function defaultKind(zone?: AppZone): DownloadMediaKind {
  if (zone === "podcast") return "podcast";
  if (zone === "video") return "video";
  return "song";
}

export function DownloadSheet({
  open,
  onOpenChange,
  download,
  zone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: DownloadHook;
  zone?: AppZone;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar descargas"
      viewportRatio={0.9}
    >
      <DownloadSheetBody download={download} zone={zone} />
    </BottomSheet>
  );
}

function DownloadSheetBody({ download, zone }: { download: DownloadHook; zone?: AppZone }) {
  const { settings, setSettings, token, setToken, busy, feedback, job, persist, testConnection, enqueue } =
    download;
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<DownloadMediaKind>(defaultKind(zone));
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setKind(defaultKind(zone));
  }, [zone]);

  async function onEnqueue() {
    try {
      await enqueue(url, kind);
      setUrl("");
    } catch {
      // feedback already set
    }
  }

  const canSend = settings.enabled && !busy && Boolean(url.trim());

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleMeta}>
            <Text style={type.label}>Descargas</Text>
            <Text style={type.pageTitle}>yt-dlp</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cómo configurar yt-dlp"
            onPress={() => {
              triggerUiHaptic();
              setInfoOpen(true);
            }}
            style={({ pressed }) => [styles.infoBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Info color={colors.inkSoft} size={18} strokeWidth={1.9} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Servidor</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchMeta}>
                <Text style={styles.switchLabel}>Activar</Text>
                <Text style={styles.switchHint}>
                  {settings.enabled ? `${settings.host}:${settings.port}` : "Apagado"}
                </Text>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={(enabled) => setSettings({ ...settings, enabled })}
                trackColor={{ false: colors.rule, true: colors.accent }}
                thumbColor={colors.ink}
              />
            </View>

            <View style={styles.cardBody}>
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
                label="Token"
                value={token}
                onChange={setToken}
                secure
                autoCapitalize="none"
                placeholder="Opcional si AUTH_TOKEN está vacío"
              />
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void testConnection()}
                  disabled={busy || !settings.enabled}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnGhost,
                    { opacity: busy || !settings.enabled ? 0.45 : pressed ? 0.7 : 1 },
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
            </View>
          </View>
        </View>

        <View style={[styles.section, !settings.enabled && styles.sectionDim]}>
          <Text style={styles.sectionLabel}>Enviar</Text>
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <View style={styles.field}>
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
              </View>

              <View style={styles.field}>
                <Text style={type.label}>Tipo</Text>
                <View style={styles.kindRow}>
                  {KIND_OPTIONS.map((option) => {
                    const active = kind === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          triggerUiHaptic();
                          setKind(option.id);
                        }}
                        disabled={busy || !settings.enabled}
                        style={[styles.kindChip, active && styles.kindChipActive]}
                      >
                        <Text style={[styles.kindLabel, active && styles.kindLabelActive]}>{option.label}</Text>
                        <Text style={[styles.kindHint, active && styles.kindHintActive]}>{option.hint}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable
                onPress={() => void onEnqueue()}
                disabled={!canSend}
                style={({ pressed }) => [styles.enqueueBtn, { opacity: !canSend ? 0.4 : pressed ? 0.86 : 1 }]}
              >
                <Text style={styles.enqueueText}>{busy ? "Trabajando…" : "Descargar al NAS"}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {job ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Log</Text>
            <View style={[styles.card, styles.logCard]}>
              {job.progress != null ? (
                <Text style={styles.logMeta}>
                  {Math.round(job.progress)}%
                  {job.speed ? ` · ${job.speed}` : ""}
                  {job.eta ? ` · ETA ${job.eta}` : ""}
                </Text>
              ) : (
                <Text style={styles.logMeta}>
                  {job.status}
                  {job.resolvedKind ? ` · ${job.resolvedKind}` : ""}
                </Text>
              )}
              <Text style={styles.logText}>{(job.log ?? []).join("\n") || "—"}</Text>
            </View>
          </View>
        ) : null}

        {feedback ? <Text style={[type.body, styles.feedback, { color: feedback.color }]}>{feedback.text}</Text> : null}
      </SheetScrollView>
      <DownloadHelpDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}

async function copyCompose(): Promise<void> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(YTDLP_COMPOSE);
    return;
  }
  await Share.share({ title: "docker-compose.yml", message: YTDLP_COMPOSE });
}

const HELP_STEPS = [
  {
    title: "Carpetas",
    body: "Crea Music/Canciones, Music/Podcasts y Popcorn/movies en el NAS.",
  },
  {
    title: "App del downloader",
    body: "Copia nas/podcast-downloader a /volume1/Music/snd-downloader-app (app.py y requirements.txt).",
  },
  {
    title: "Compose",
    body: "En Container Manager pega el YAML. Cambia /volume1/Music y /volume1/Popcorn si tus volúmenes son otros.",
  },
  {
    title: "Desplegar",
    body: "Arranca el stack y espera a que instale ffmpeg y yt-dlp.",
  },
  {
    title: "Conectar SND",
    body: "Abre http://IP-DEL-NAS:8091/health. En SND usa esa IP, puerto 8091 y el mismo AUTH_TOKEN (vacío si no hay token).",
  },
] as const;

function DownloadHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const cardMaxHeight = Math.round(windowHeight * 0.9);

  function close() {
    setCopied(false);
    onClose();
  }

  async function onCopy() {
    triggerUiHaptic();
    try {
      await copyCompose();
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={styles.helpRoot}>
        <View style={styles.helpBackdrop} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar ayuda"
            style={StyleSheet.absoluteFill}
            onPress={close}
          />
          <View style={[styles.helpCard, { maxHeight: cardMaxHeight }]} pointerEvents="auto">
            <View style={styles.helpHeader}>
              <Text style={type.label}>Descargas</Text>
              <Text style={styles.helpTitle}>Configurar yt-dlp</Text>
            </View>

            <ScrollView
              style={[
                styles.helpScroll,
                { maxHeight: Math.max(180, cardMaxHeight - 200) },
              ]}
              contentContainerStyle={styles.helpBody}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              bounces={false}
              overScrollMode="never"
            >
              <View style={styles.helpSteps}>
                {HELP_STEPS.map((step, index) => (
                  <View key={step.title} style={styles.helpStep}>
                    <View style={styles.helpIndex}>
                      <Text style={styles.helpIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.helpStepText}>
                      <Text style={styles.helpStepTitle}>{step.title}</Text>
                      <Text style={styles.helpStepBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.helpCompose}>
                <View style={styles.helpComposeBar}>
                  <Text style={styles.helpComposeLabel}>docker-compose.yml</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copiar compose"
                    onPress={() => void onCopy()}
                    style={({ pressed }) => [styles.helpCopy, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    {copied ? (
                      <Check color={colors.ok} size={16} strokeWidth={2.2} />
                    ) : (
                      <Copy color={colors.inkSoft} size={16} strokeWidth={1.8} />
                    )}
                    <Text style={[styles.helpCopyText, copied && { color: colors.ok }]}>
                      {copied ? "Copiado" : "Copiar"}
                    </Text>
                  </Pressable>
                </View>
                <Text selectable={Platform.OS === "web"} style={styles.helpCode}>
                  {YTDLP_COMPOSE.trimEnd()}
                </Text>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => {
                triggerUiHaptic();
                close();
              }}
              style={({ pressed }) => [styles.helpDone, { opacity: pressed ? 0.86 : 1 }]}
            >
              <Text style={styles.helpDoneText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
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
    paddingBottom: 48,
    gap: 22,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleMeta: { flex: 1, gap: 4 },
  infoBtn: {
    width: 36,
    height: 36,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
  },
  section: { gap: 10 },
  sectionDim: { opacity: 0.48 },
  sectionLabel: {
    ...type.label,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardBody: {
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  feedback: { paddingHorizontal: 2 },
  helpRoot: { flex: 1 },
  helpBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 7, 6, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  helpCard: {
    width: "100%",
    maxWidth: 420,
    flexShrink: 1,
    zIndex: 1,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 16,
  },
  helpHeader: { gap: 4, flexShrink: 0 },
  helpTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  helpScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  helpBody: { gap: 16, paddingBottom: 8 },
  helpSteps: { gap: 12 },
  helpStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  helpIndex: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.sheetHover,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  helpIndexText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.accent,
  },
  helpStepText: { flex: 1, gap: 2 },
  helpStepTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  helpStepBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  helpCompose: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    borderRadius: 10,
    overflow: "hidden",
  },
  helpComposeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  helpComposeLabel: {
    ...type.label,
    letterSpacing: 0.4,
  },
  helpCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingLeft: 8,
  },
  helpCopyText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  helpCode: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  helpDone: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  helpDoneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.accentText,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  switchMeta: { flex: 1, gap: 2 },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  switchHint: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  actions: { flexDirection: "row", gap: 10, paddingTop: 2 },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnGhost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  btnSolid: { backgroundColor: colors.accent },
  btnGhostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  btnSolidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  kindRow: { flexDirection: "row", gap: 8 },
  kindChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
    backgroundColor: colors.void,
  },
  kindChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.sheetRaised,
  },
  kindLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.muted },
  kindLabelActive: { color: colors.ink },
  kindHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  kindHintActive: { color: colors.inkSoft },
  enqueueBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  enqueueText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.accentText },
  logCard: {
    backgroundColor: colors.void,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    minHeight: 112,
  },
  logMeta: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.inkSoft },
  logText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
});
