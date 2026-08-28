import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Headphones, Settings, Sparkles, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ChatBubble, ChatTypingMarker } from "@/components/chat/chat-bubble";
import { useKeyboardBottomOverlap } from "@/components/chat/use-keyboard-bottom-overlap";
import { useCursor } from "@/hooks/use-cursor";
import { useI18n } from "@/lib/i18n/context";
import { webInteractiveStyle } from "@/lib/interactive";
import { colors, fonts } from "@/lib/theme";

function resolveBottomInset(inset: number): number {
  if (inset > 0) return inset;
  return Platform.select({ ios: 34, android: 24, default: 0 }) ?? 0;
}

const SEND_ACTIVE = "#2563eb";
const SEND_ACTIVE_HOVER = "#1d4ed8";
const SEND_ICON = "#ffffff";

function buildUtilities(t: (path: string) => string): { id: string; label: string; hint: string; draft: string }[] {
  return [
    { id: "task-create", label: t("chat.utilCreateTask"), hint: t("chat.utilCreateTaskHint"), draft: t("chat.utilDraftTaskCreate") },
    { id: "task-move", label: t("chat.utilMoveTask"), hint: t("chat.utilMoveTaskHint"), draft: t("chat.utilDraftTaskMove") },
    { id: "rename", label: t("chat.utilRename"), hint: t("chat.utilRenameHint"), draft: t("chat.utilDraftRename") },
    { id: "cover-track", label: t("chat.utilCoverSong"), hint: t("chat.utilCoverSongHint"), draft: t("chat.utilDraftCoverTrack") },
    { id: "cover-podcast", label: t("chat.utilCoverPodcast"), hint: t("chat.utilCoverPodcastHint"), draft: t("chat.utilDraftCoverPodcast") },
    { id: "no-play", label: t("chat.utilNoSound"), hint: t("chat.utilNoSoundHint"), draft: t("chat.utilDraftNoPlay") },
    { id: "missing", label: t("chat.utilMissing"), hint: t("chat.utilMissingHint"), draft: t("chat.utilDraftMissing") },
    { id: "ytdlp", label: t("chat.utilDownload"), hint: t("chat.utilDownloadHint"), draft: t("chat.utilDraftDownload") },
    { id: "nas", label: t("chat.utilNas"), hint: t("chat.utilNasHint"), draft: t("chat.utilDraftNas") },
    { id: "spotify", label: t("chat.utilSpotify"), hint: t("chat.utilSpotifyHint"), draft: t("chat.utilDraftSpotify") },
    { id: "onepiece", label: t("chat.utilOnePiece"), hint: t("chat.utilOnePieceHint"), draft: t("chat.utilDraftOnePiece") },
    { id: "wealth-tx", label: t("chat.utilMoney"), hint: t("chat.utilMoneyHint"), draft: t("chat.utilDraftMoney") },
    { id: "wealth-hold", label: t("chat.utilAsset"), hint: t("chat.utilAssetHint"), draft: t("chat.utilDraftAsset") },
    { id: "wealth-goal", label: t("chat.utilGoal"), hint: t("chat.utilGoalHint"), draft: t("chat.utilDraftGoal") },
  ];
}

function ChatDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        style={styles.dialogBackdrop}
        onPress={onClose}
      >
        <Pressable style={styles.dialogCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ChatSheet() {
  const { t } = useI18n();
  const { chatOpen, setChatOpen } = useCursor();
  return (
    <BottomSheet
      open={chatOpen}
      onOpenChange={setChatOpen}
      accessibilityCloseLabel={t("chat.closeChat")}
      viewportRatio={0.92}
    >
      <ChatSheetBody />
    </BottomSheet>
  );
}

function ChatSheetBody() {
  const { t } = useI18n();
  const {
    apiKey,
    setApiKey,
    busy,
    messages,
    persist,
    testConnection,
    send,
    feedback,
    clearHistory,
  } = useCursor();
  const [draft, setDraft] = useState("");
  const [setupOpen, setSetupOpen] = useState(!apiKey);
  const [utilsOpen, setUtilsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const canSend = Boolean(draft.trim()) && !busy && Boolean(apiKey.trim());
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { overlap: keyboardOverlap } = useKeyboardBottomOverlap(true);
  const keyboardOpen = keyboardOverlap > 0;
  // El sheet se hunde bottomInset bajo la ventana. Hay que sumarlo siempre
  // o el input queda cortado por el teclado / barra de sistema.
  const sheetBottomPad = keyboardOverlap + bottomInset + (keyboardOpen ? 0 : 36);

  const utilities = buildUtilities(t);

  useEffect(() => {
    if (!apiKey) setSetupOpen(true);
  }, [apiKey]);

  async function onSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await send(text);
  }

  return (
    <View style={[styles.panel, { paddingBottom: sheetBottomPad }]}>
      <View style={[styles.header, { borderBottomColor: colors.rule }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t("chat.title")}</Text>
          <Text style={styles.description}>{t("chat.agent")}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={t("chat.clearBtn")}
            disabled={messages.length === 0}
            onPress={() => {
              setClearOpen(true);
              setUtilsOpen(false);
              setSetupOpen(false);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                borderColor: colors.rule,
                opacity: messages.length === 0 ? 0.35 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Trash2 size={16} color={colors.inkSoft} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            accessibilityLabel={t("chat.utilitiesBtn")}
            onPress={() => {
              setUtilsOpen((value) => !value);
              setSetupOpen(false);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                borderColor: utilsOpen ? colors.inkSoft : colors.rule,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Sparkles size={16} color={utilsOpen ? colors.ink : colors.inkSoft} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            accessibilityLabel={t("chat.agentSettings")}
            onPress={() => {
              setSetupOpen((value) => !value);
              setUtilsOpen(false);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                borderColor: setupOpen ? colors.inkSoft : colors.rule,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Settings size={16} color={setupOpen ? colors.ink : colors.inkSoft} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>

      <View style={styles.messagesShell}>
        {messages.length === 0 && !busy ? (
          <View style={styles.centered}>
            <View style={styles.emptyIcon}>
              <Headphones size={22} color={colors.inkSoft} strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>{t("chat.newChat")}</Text>
            <Text style={styles.emptyBody}>{t("chat.empty")}</Text>
          </View>
        ) : (
          <SheetScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {messages.map((item) => (
              <ChatBubble key={item.id} role={item.role} content={item.text} />
            ))}
            {busy ? <ChatTypingMarker /> : null}
          </SheetScrollView>
        )}
      </View>

      <View style={[styles.composer, { borderTopColor: colors.rule }]}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={colors.muted}
          editable={!busy}
          multiline
          maxLength={4000}
          onSubmitEditing={() => {
            if (Platform.OS === "web" && canSend) void onSend();
          }}
          blurOnSubmit={false}
          style={[
            styles.input,
            webInteractiveStyle(),
            Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as object) : null,
          ]}
          accessibilityLabel={t("chat.messageLabel")}
        />
        <Pressable
          onPress={() => void onSend()}
          disabled={!canSend}
          accessibilityLabel={t("chat.send")}
          {...(Platform.OS === "web"
            ? ({
                onMouseDown: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                },
              } as object)
            : null)}
          style={(state) => {
            const hovered = Boolean((state as { hovered?: boolean }).hovered);
            return [
              styles.sendBtn,
              webInteractiveStyle(),
              {
                backgroundColor: canSend
                  ? state.pressed || hovered
                    ? SEND_ACTIVE_HOVER
                    : SEND_ACTIVE
                  : colors.sheetHover,
                opacity: canSend ? 1 : 0.55,
              },
            ];
          }}
        >
          {busy ? (
            <ActivityIndicator color={SEND_ICON} size="small" />
          ) : (
            <ArrowUp size={16} color={canSend ? SEND_ICON : colors.muted} strokeWidth={2.25} />
          )}
        </Pressable>
      </View>

      <ChatDialog open={utilsOpen} title={t("chat.utilities")} onClose={() => setUtilsOpen(false)}>
        <Text style={styles.dialogHint}>{t("chat.utilitiesHint")}</Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {utilities.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setDraft(item.draft);
                setUtilsOpen(false);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              style={({ pressed }) => [styles.utilRow, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={styles.utilLabel}>{item.label}</Text>
              <Text style={styles.utilHint}>{item.hint}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </ChatDialog>

      <ChatDialog open={setupOpen} title={t("chat.agentSection")} onClose={() => setSetupOpen(false)}>
        <Text style={styles.dialogHint}>{t("chat.agentSetupHint")}</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("chat.keyPlaceholder")}
          placeholderTextColor={colors.muted}
          style={styles.keyInput}
        />
        <View style={styles.setupActions}>
          <Pressable
            disabled={busy}
            onPress={() => void testConnection()}
            style={({ pressed }) => [styles.setupBtn, styles.setupGhost, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.setupGhostText}>{t("chat.test")}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => {
              void persist();
              if (apiKey.trim()) setSetupOpen(false);
            }}
            style={({ pressed }) => [styles.setupBtn, styles.setupSolid, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.setupSolidText}>{t("chat.save")}</Text>
          </Pressable>
        </View>
        {feedback ? <Text style={[styles.feedback, { color: feedback.color }]}>{feedback.text}</Text> : null}
      </ChatDialog>

      <ConfirmDialog
        open={clearOpen}
        title={t("chat.clearHistory")}
        message={t("chat.clearHistoryMessage")}
        confirmLabel={t("chat.clearConfirm")}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          void clearHistory();
          setClearOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 7, 6, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "78%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.ruleLight,
    backgroundColor: colors.sheetRaised,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 10,
  },
  dialogTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  dialogHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 4, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: colors.ink },
  description: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  utilRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 2,
  },
  utilLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink },
  utilHint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted },
  keyInput: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  setupActions: { flexDirection: "row", gap: 8 },
  setupBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 8,
  },
  setupGhost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  setupSolid: { backgroundColor: colors.accent },
  setupGhostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  setupSolidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  feedback: { fontFamily: fonts.sans, fontSize: 13 },
  messagesShell: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    textAlign: "center",
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 280,
    color: colors.muted,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
