import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Info } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import type { SettingsFeedback } from "@/hooks/use-nas-settings";
import { folderDisplayName, pickLocalFolder } from "@/lib/local/pick-folder";
import { useI18n } from "@/lib/i18n/context";
import type { NasSettings } from "@/lib/settings/storage";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const MUSIC_HELP_KEYS = [
  { title: "localFolder.albums", body: "localFolder.albumsBody" },
  { title: "localFolder.loose", body: "localFolder.looseBody" },
  { title: "localFolder.covers", body: "localFolder.coversBody" },
  { title: "localFolder.audio", body: "localFolder.audioBody" },
] as const;

const PODCAST_HELP_KEYS = [
  { title: "localFolder.shows", body: "localFolder.showsBody" },
  { title: "localFolder.audio", body: "localFolder.audioBody" },
] as const;

const WEALTH_HELP_KEYS = [
  { title: "localFolder.file", body: "localFolder.fileBody" },
  { title: "localFolder.nas", body: "localFolder.nasBody" },
] as const;

const FOCUS_HELP_KEYS = [
  { title: "localFolder.file", body: "localFolder.focusFileBody" },
  { title: "localFolder.nas", body: "localFolder.nasBody" },
] as const;

const VIDEO_HELP_KEYS = [
  { title: "localFolder.series", body: "localFolder.seriesBody" },
  { title: "localFolder.movies", body: "localFolder.moviesBody" },
  { title: "explorer.video", body: "localFolder.videoBody" },
] as const;

export function LocalFolderSheet({
  open,
  onOpenChange,
  settings,
  applyLocalFolder,
  busy,
  feedback,
  variant = "music",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: NasSettings;
  applyLocalFolder: (next: NasSettings) => Promise<void>;
  busy: boolean;
  feedback: SettingsFeedback | null;
  variant?: "music" | "podcast" | "video" | "wealth" | "focus";
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const uri =
    variant === "video"
      ? settings.videoLocalFolderUri
      : variant === "podcast"
        ? settings.podcastLocalFolderUri
        : variant === "wealth"
          ? settings.wealthLocalFolderUri
          : variant === "focus"
            ? settings.focusLocalFolderUri
            : settings.localFolderUri;
  const storedName =
    variant === "video"
      ? settings.videoLocalFolderName
      : variant === "podcast"
        ? settings.podcastLocalFolderName
        : variant === "wealth"
          ? settings.wealthLocalFolderName
          : variant === "focus"
            ? settings.focusLocalFolderName
            : settings.localFolderName;
  const name = folderDisplayName(uri, storedName);
  const hasFolder = Boolean(uri);

  function withFolder(nextUri: string, nextName: string): NasSettings {
    if (variant === "video") return { ...settings, videoLocalFolderUri: nextUri, videoLocalFolderName: nextName };
    if (variant === "podcast") return { ...settings, podcastLocalFolderUri: nextUri, podcastLocalFolderName: nextName };
    if (variant === "wealth") return { ...settings, wealthLocalFolderUri: nextUri, wealthLocalFolderName: nextName };
    if (variant === "focus") return { ...settings, focusLocalFolderUri: nextUri, focusLocalFolderName: nextName };
    return { ...settings, localFolderUri: nextUri, localFolderName: nextName };
  }

  async function choose() {
    triggerUiHaptic();
    setError(null);
    try {
      const picked = await pickLocalFolder();
      if (!picked) return;
      await applyLocalFolder(withFolder(picked.uri, picked.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("localFolder.openFail"));
    }
  }

  async function clear() {
    triggerUiHaptic();
    setError(null);
    await applyLocalFolder(withFolder("", ""));
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("localFolder.close")}
      viewportRatio={0.62}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleMeta}>
            <Text style={type.label}>{t("sourceSheet.title")}</Text>
            <Text style={type.pageTitle}>{t("localFolder.title")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localFolder.howA11y")}
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
          <Text style={styles.sectionLabel}>
            {variant === "wealth" || variant === "focus" ? t("localFolder.file") : t("localFolder.library")}
          </Text>
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.pathLabel}>{t("localFolder.folder")}</Text>
              <Text style={styles.pathValue}>{hasFolder ? name : t("localFolder.none")}</Text>
              <Text style={styles.hint}>
                {variant === "wealth"
                  ? t("localFolder.wealthFileHint")
                  : variant === "focus"
                    ? t("localFolder.focusFileHint")
                    : Platform.OS === "web"
                      ? t("localFolder.webHint")
                      : t("localFolder.mediaHint")}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => void choose()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnSolid,
                  { opacity: busy ? 0.45 : pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.btnSolidText}>
                  {busy ? t("localFolder.opening") : hasFolder ? t("localFolder.change") : t("localFolder.pick")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void clear()}
                disabled={busy || !hasFolder}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhost,
                  { opacity: !hasFolder || busy ? 0.4 : pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.btnGhostText}>{t("localFolder.remove")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
        {feedback ? <Text style={[type.body, { color: feedback.color }]}>{feedback.text}</Text> : null}
      </SheetScrollView>
      <LocalFolderHelpDialog open={infoOpen} onClose={() => setInfoOpen(false)} variant={variant} />
    </BottomSheet>
  );
}

function LocalFolderHelpDialog({
  open,
  onClose,
  variant = "music",
}: {
  open: boolean;
  onClose: () => void;
  variant?: "music" | "podcast" | "video" | "wealth" | "focus";
}) {
  const { t } = useI18n();
  const stepKeys =
    variant === "video"
      ? VIDEO_HELP_KEYS
      : variant === "podcast"
        ? PODCAST_HELP_KEYS
        : variant === "wealth"
          ? WEALTH_HELP_KEYS
          : variant === "focus"
            ? FOCUS_HELP_KEYS
            : MUSIC_HELP_KEYS;
  const { height: windowHeight } = useWindowDimensions();
  const cardMaxHeight = Math.round(windowHeight * 0.9);

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.helpRoot}>
        <View style={styles.helpBackdrop} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localFolder.helpCloseA11y")}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <View style={[styles.helpCard, { maxHeight: cardMaxHeight }]} pointerEvents="auto">
            <View style={styles.helpHeader}>
              <Text style={type.label}>{t("sourceSheet.title")}</Text>
              <Text style={styles.helpTitle}>{t("localFolder.helpTitle")}</Text>
            </View>

            <ScrollView
              style={[styles.helpScroll, { maxHeight: Math.max(180, cardMaxHeight - 200) }]}
              contentContainerStyle={styles.helpBody}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              bounces={false}
              overScrollMode="never"
            >
              <View style={styles.helpSteps}>
                {stepKeys.map((step, index) => (
                  <View key={step.title} style={styles.helpStep}>
                    <View style={styles.helpIndex}>
                      <Text style={styles.helpIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.helpStepText}>
                      <Text style={styles.helpStepTitle}>{t(step.title)}</Text>
                      <Text style={styles.helpStepBody}>{t(step.body)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => {
                triggerUiHaptic();
                onClose();
              }}
              style={({ pressed }) => [styles.helpDone, { opacity: pressed ? 0.86 : 1 }]}
            >
              <Text style={styles.helpDoneText}>{t("common.understood")}</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
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
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  pathLabel: { ...type.label },
  pathValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
  },
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
});
