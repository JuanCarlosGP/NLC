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
}) {
  const shared = settings.sourceKind !== "mock";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar configuración"
      viewportRatio={0.82}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.label}>Fuente</Text>
        <Text style={type.pageTitle}>Configuración</Text>

        <Field
          label="Host"
          value={settings.host}
          onChange={(host) => setSettings({ ...settings, host })}
          autoCapitalize="none"
        />
        <View style={styles.pair}>
          <View style={styles.pairItem}>
            <Field
              label="Puerto"
              value={settings.port}
              onChange={(port) => setSettings({ ...settings, port })}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.pairItem}>
            <Field
              label="Usuario"
              value={settings.username}
              onChange={(username) => setSettings({ ...settings, username })}
              autoCapitalize="none"
            />
          </View>
        </View>
        <Field label="Contraseña" value={password} onChange={setPassword} secure autoCapitalize="none" />
        {settings.sourceKind === "webdav" ? (
          <Field
            label="Carpeta"
            value={settings.sharePath || "/Music"}
            onChange={(sharePath) => setSettings({ ...settings, sharePath })}
            autoCapitalize="none"
          />
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>HTTPS</Text>
          <Switch
            value={settings.useHttps}
            onValueChange={(useHttps) => setSettings({ ...settings, useHttps })}
            trackColor={{ false: colors.rule, true: colors.accent }}
            thumbColor={colors.ink}
          />
        </View>

        {settings.sourceKind === "opensubsonic" ? (
          <View style={styles.bitRate}>
            <Text style={type.label}>Calidad de stream</Text>
            <View style={styles.row}>
              {[
                { id: "0", label: "Original" },
                { id: "320", label: "320 kbps" },
                { id: "192", label: "192 kbps" },
              ].map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSettings({ ...settings, maxBitRate: item.id })}
                  style={[styles.choice, settings.maxBitRate === item.id && styles.choiceActive]}
                >
                  <Text style={[styles.choiceLabel, settings.maxBitRate === item.id && styles.choiceLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
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
              { opacity: busy || !shared ? 0.55 : pressed ? 0.7 : 1 },
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

        {feedback ? <Text style={[type.body, { color: feedback.color }]}>{feedback.text}</Text> : null}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
  keyboardType?: "number-pad" | "default";
  autoCapitalize?: "none" | "sentences";
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
    paddingBottom: 32,
    gap: 12,
  },
  field: { gap: 6 },
  pair: { flexDirection: "row", gap: 10 },
  pairItem: { flex: 1 },
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
  bitRate: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { backgroundColor: colors.sheetHover, borderColor: colors.ruleLight },
  choiceLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  choiceLabelActive: { color: colors.ink },
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
});
