import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
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
import { webInteractiveStyle } from "@/lib/interactive";
import { colors, fonts } from "@/lib/theme";

function resolveBottomInset(inset: number): number {
  if (inset > 0) return inset;
  return Platform.select({ ios: 34, android: 24, default: 0 }) ?? 0;
}

const SEND_ACTIVE = "#2563eb";
const SEND_ACTIVE_HOVER = "#1d4ed8";
const SEND_ICON = "#ffffff";

const UTILITIES: { id: string; label: string; hint: string; draft: string }[] = [
  {
    id: "task-create",
    label: "Crear tarea",
    hint: "Bandeja, proyecto o fecha",
    draft: "Crea la tarea «título» en Bandeja para hoy y ponla en por hacer.",
  },
  {
    id: "task-move",
    label: "Mover tarea",
    hint: "Por hacer / en curso / hecho",
    draft: "Pasa «título» a en curso y anota: «detalle».",
  },
  {
    id: "rename",
    label: "Renombrar",
    hint: "Canción, playlist, álbum o vídeo",
    draft: "Renombra «nombre actual» a «nombre nuevo».",
  },
  {
    id: "cover-track",
    label: "Carátula de canción",
    hint: "Jpg con el mismo nombre que el audio",
    draft:
      "La canción «título» no tiene carátula. En SND la portada es un jpg al lado del mp3, mismo nombre. ¿Qué archivo pongo y en qué carpeta?",
  },
  {
    id: "cover-podcast",
    label: "Carátula de podcast",
    hint: "El episodio no hereda la de la carpeta",
    draft:
      "El episodio «título o #nº» no muestra portada. Los podcasts no usan el cover.jpg de la carpeta: hace falta «nombre-del-audio.jpg». ¿Cómo lo dejo?",
  },
  {
    id: "no-play",
    label: "No suena",
    hint: "Pista, episodio o capítulo",
    draft:
      "No reproduce «título». Fuente WebDAV 192.168.1.106:5005 /Music. ¿Qué reviso (conexión, ruta, formato)?",
  },
  {
    id: "missing",
    label: "No aparece",
    hint: "Biblioteca, búsqueda o recientes",
    draft:
      "No encuentro «artista / álbum / canción» en Biblioteca. ¿Debería salir en Canciones, Álbumes o Podcasts? ¿Hace falta refrescar?",
  },
  {
    id: "ytdlp",
    label: "Descargar",
    hint: "yt-dlp :8091 y miniatura",
    draft:
      "Quiero bajar «URL» con yt-dlp (192.168.1.106:8091) a /Music/Podcasts o /Music/Canciones, con jpg al lado. ¿Cómo lo dejo en Ajustes y en el NAS?",
  },
  {
    id: "nas",
    label: "NAS no conecta",
    hint: "Host, puerto, usuario y carpeta",
    draft:
      "No conecta la carpeta compartida. Host «192.168.1.106», puerto «5005», usuario Viewer, carpeta /Music, HTTPS off. ¿Checklist?",
  },
  {
    id: "spotify",
    label: "Playlist de Spotify",
    hint: "Importar y matchear contra el NAS",
    draft:
      "Quiero importar esta playlist: «URL». SND no reproduce Spotify: la matchea con lo que hay en /Music. ¿Pasos en Biblioteca → +?",
  },
  {
    id: "onepiece",
    label: "Capítulo One Piece",
    hint: "Saga, arco y archivo",
    draft:
      "No encuentro o no abre el capítulo «arco / episodio» de One Piece. ¿Cómo está montado (saga → arco → archivo) y qué reviso?",
  },
];

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
  if (!open) return null;
  return (
    <Pressable style={styles.dialogBackdrop} onPress={onClose} accessibilityLabel="Cerrar">
      <Pressable style={styles.dialogCard} onPress={(event) => event.stopPropagation()}>
        <Text style={styles.dialogTitle}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
}

export function ChatSheet() {
  const { chatOpen, setChatOpen } = useCursor();
  return (
    <BottomSheet
      open={chatOpen}
      onOpenChange={setChatOpen}
      accessibilityCloseLabel="Cerrar chat"
      viewportRatio={0.92}
    >
      <ChatSheetBody />
    </BottomSheet>
  );
}

function ChatSheetBody() {
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
          <Text style={styles.title}>Mensajes</Text>
          <Text style={styles.description}>Agente SND · Cursor</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Borrar historial"
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
            accessibilityLabel="Utilidades"
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
            accessibilityLabel="Ajustes del agente"
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
            <Text style={styles.emptyTitle}>Nueva conversación</Text>
            <Text style={styles.emptyBody}>
              Pide lo que quieras: crear o mover tareas, anotar, renombrar canciones, playlists o vídeos.
            </Text>
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
          placeholder="Cuéntanos qué te pasa…"
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
          accessibilityLabel="Mensaje"
        />
        <Pressable
          onPress={() => void onSend()}
          disabled={!canSend}
          accessibilityLabel="Enviar"
          {...(Platform.OS === "web"
            ? ({
                onMouseDown: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                },
              } as object)
            : null)}
          style={({ pressed, hovered }) => [
            styles.sendBtn,
            webInteractiveStyle(),
            {
              backgroundColor: canSend
                ? pressed || hovered
                  ? SEND_ACTIVE_HOVER
                  : SEND_ACTIVE
                : colors.sheetHover,
              opacity: canSend ? 1 : 0.55,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={SEND_ICON} size="small" />
          ) : (
            <ArrowUp size={16} color={canSend ? SEND_ICON : colors.muted} strokeWidth={2.25} />
          )}
        </Pressable>
      </View>

      <ChatDialog open={utilsOpen} title="Utilidades" onClose={() => setUtilsOpen(false)}>
        <Text style={styles.dialogHint}>Elige una. Completa lo que va entre « ».</Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {UTILITIES.map((item) => (
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

      <ChatDialog open={setupOpen} title="Agente" onClose={() => setSetupOpen(false)}>
        <Text style={styles.dialogHint}>
          Pega la API key. Se guarda en el teléfono. El agente no ve el NAS.
        </Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="crsr_…"
          placeholderTextColor={colors.muted}
          style={styles.keyInput}
        />
        <View style={styles.setupActions}>
          <Pressable
            disabled={busy}
            onPress={() => void testConnection()}
            style={({ pressed }) => [styles.setupBtn, styles.setupGhost, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.setupGhostText}>Probar</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => {
              void persist();
              if (apiKey.trim()) setSetupOpen(false);
            }}
            style={({ pressed }) => [styles.setupBtn, styles.setupSolid, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.setupSolidText}>Guardar</Text>
          </Pressable>
        </View>
        {feedback ? <Text style={[styles.feedback, { color: feedback.color }]}>{feedback.text}</Text> : null}
      </ChatDialog>

      <ConfirmDialog
        open={clearOpen}
        title="Borrar historial"
        message="Se vacía esta conversación. La API key se queda."
        confirmLabel="Borrar"
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 7, 6, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 20,
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
