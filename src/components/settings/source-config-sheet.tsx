import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import type { SettingsFeedback } from "@/hooks/use-nas-settings";
import type { NasSettings } from "@/lib/settings/storage";
import { colors, fonts, type } from "@/lib/theme";

export function SourceConfigSheet({
  open,
  onOpenChange,
  settings,
  setSettings,
  password,
  setPassword,
  feedback,
  busy,
  testConnection,
  save,
  variant = "music",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: NasSettings;
  setSettings: (next: NasSettings) => void;
  password: string;
  setPassword: (next: string) => void;
  feedback: SettingsFeedback | null;
  busy: boolean;
  testConnection: () => Promise<void>;
  save: () => Promise<void>;
  variant?: "music" | "podcast" | "video" | "wealth" | "focus";
}) {
  const shared = settings.sourceKind !== "mock";
  const folderPlaceholder =
    variant === "video"
      ? "/volume1/Popcorn"
      : variant === "podcast"
        ? "/volume1/Music/Podcasts"
        : variant === "wealth" || variant === "focus"
          ? "/volume1/Music/NLC"
          : "/volume1/Music";
  const title =
    variant === "video"
      ? "Vídeo"
      : variant === "podcast"
        ? "Podcasts"
        : variant === "wealth"
          ? "Patrimonio"
          : variant === "focus"
            ? "Tareas"
            : "Música";
  const summary = `${settings.useHttps ? "https" : "http"}://${settings.host}:${settings.port}`;
  const folderHint =
    variant === "video"
      ? "La ruta que ves en el NAS, por ejemplo /volume1/Popcorn. Dentro: series/ y movies/."
      : variant === "podcast"
        ? "La ruta que ves en el NAS, por ejemplo /volume1/Music/Podcasts."
        : variant === "wealth"
          ? "Carpeta del NAS donde se guarda nlc-wealth.json (cuentas, movimientos e inversiones)."
          : variant === "focus"
            ? "Carpeta del NAS donde se guarda nlc-tasks.json (tareas, proyectos y recordatorios)."
            : "La ruta que ves en el NAS, por ejemplo /volume1/Music.";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar configuración"
      viewportRatio={0.82}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>Fuente</Text>
          <Text style={type.pageTitle}>{title}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Conexión</Text>
          <View style={styles.card}>
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
                label="Usuario"
                value={settings.username}
                onChange={(username) => setSettings({ ...settings, username })}
                autoCapitalize="none"
              />
              <Field label="Contraseña" value={password} onChange={setPassword} secure autoCapitalize="none" />
              {settings.sourceKind === "webdav" ? (
                <>
                  <Field
                    label="Ruta"
                    value={settings.sharePath}
                    onChange={(sharePath) => setSettings({ ...settings, sharePath })}
                    placeholder={folderPlaceholder}
                    autoCapitalize="none"
                  />
                  <Text style={styles.folderHint}>{folderHint}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Acceso</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchMeta}>
                <Text style={styles.switchLabel}>HTTPS</Text>
                <Text style={styles.switchHint}>{summary}</Text>
              </View>
              <Switch
                value={settings.useHttps}
                onValueChange={(useHttps) => setSettings({ ...settings, useHttps })}
                trackColor={{ false: colors.rule, true: colors.accent }}
                thumbColor={colors.ink}
              />
            </View>

            {settings.sourceKind === "opensubsonic" && variant !== "wealth" && variant !== "focus" ? (
              <View style={styles.cardBody}>
                <Text style={type.label}>Calidad de stream</Text>
                <View style={styles.row}>
                  {[
                    { id: "0", label: "Original" },
                    { id: "320", label: "320 kbps" },
                    { id: "192", label: "192 kbps" },
                  ].map((item) => {
                    const active = settings.maxBitRate === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setSettings({ ...settings, maxBitRate: item.id })}
                        style={[styles.choice, active && styles.choiceActive]}
                      >
                        <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={() => void testConnection()}
                disabled={busy || !shared}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhost,
                  { opacity: busy || !shared ? 0.45 : pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.btnGhostText}>{busy ? "Probando…" : "Probar"}</Text>
              </Pressable>
              <Pressable
                onPress={() => void save()}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.btnSolid, { opacity: pressed || busy ? 0.7 : 1 }]}
              >
                <Text style={styles.btnSolidText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {feedback ? <Text style={[type.body, styles.feedback, { color: feedback.color }]}>{feedback.text}</Text> : null}
      </SheetScrollView>
    </BottomSheet>
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
  titleMeta: { gap: 4 },
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
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  folderHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: -4,
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.void,
  },
  choiceActive: { backgroundColor: colors.sheetRaised, borderColor: colors.accent },
  choiceLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  choiceLabelActive: { color: colors.ink },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
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
  feedback: { paddingHorizontal: 2 },
});
