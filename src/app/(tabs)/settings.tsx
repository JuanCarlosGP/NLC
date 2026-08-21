import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { SourceConfigSheet } from "@/components/settings/source-config-sheet";
import { Screen } from "@/components/ui/screen";
import { useNasSettings } from "@/hooks/use-nas-settings";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import type { MusicSourceKind } from "@/lib/nas/types";

export default function SettingsScreen() {
  const nas = useNasSettings();
  const { settings, setSettings, password, setPassword, feedback, connected } = nas;
  const [configOpen, setConfigOpen] = useState(false);
  const shareReady = connected && settings.sourceKind === "webdav";

  function setKind(kind: MusicSourceKind) {
    setSettings({ ...settings, sourceKind: kind });
  }

  const summary =
    settings.sourceKind === "mock"
      ? "Biblioteca de ejemplo"
      : settings.sourceKind === "webdav"
        ? `${settings.host}:${settings.port} · ${settings.sharePath || "/Music"}`
        : `${settings.host}:${settings.port}`;

  return (
    <Screen>
      <Text style={type.pageTitle}>Ajustes</Text>

      <Text style={type.sectionTitle}>Fuente</Text>
      <View style={styles.row}>
        <Choice
          label="Carpeta compartida"
          active={settings.sourceKind === "webdav"}
          onPress={() => {
            setKind("webdav");
            setSettings({
              ...settings,
              sourceKind: "webdav",
              host: settings.host || "192.168.1.106",
              port: settings.port === "4533" ? "5005" : settings.port || "5005",
              username: settings.username || "Viewer",
              sharePath: settings.sharePath || "/Music",
              useHttps: false,
            });
            if (!password) setPassword("Viewer");
          }}
        />
        <Choice
          label="Biblioteca de ejemplo"
          active={settings.sourceKind === "mock"}
          onPress={() => setKind("mock")}
        />
        <Choice
          label="Navidrome"
          active={settings.sourceKind === "opensubsonic"}
          onPress={() => {
            setKind("opensubsonic");
            setSettings({
              ...settings,
              sourceKind: "opensubsonic",
              port: settings.port === "5005" ? "4533" : settings.port || "4533",
            });
          }}
        />
      </View>

      <View style={styles.configBlock}>
        <Pressable
          onPress={() => {
            triggerUiHaptic();
            setConfigOpen(true);
          }}
          style={({ pressed }) => [styles.configBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          {shareReady ? <View style={styles.statusDot} /> : null}
          <View style={styles.configMeta}>
            <Text style={styles.configTitle}>Configuración</Text>
            <Text numberOfLines={1} style={styles.configSummary}>
              {summary}
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={20} />
        </Pressable>
        {shareReady ? (
          <Pressable
            disabled={nas.busy}
            onPress={() => {
              triggerUiHaptic();
              void nas.saveShareConfig();
            }}
            style={({ pressed }) => [
              styles.saveShareBtn,
              { opacity: nas.busy ? 0.55 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.saveShareLabel}>Guardar configuración</Text>
          </Pressable>
        ) : null}
      </View>
      {feedback ? (
        <Text style={[type.meta, { color: feedback.color }]}>{feedback.text}</Text>
      ) : null}

      <Text style={type.sectionTitle}>Descargas</Text>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Descargas</Text>
          <Text style={type.meta}>Próximamente. El MVP reproduce en streaming.</Text>
        </View>
        <Switch value={false} disabled trackColor={{ false: colors.rule, true: colors.rule }} />
      </View>

      <SourceConfigSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        settings={settings}
        setSettings={setSettings}
        password={password}
        setPassword={setPassword}
        feedback={nas.feedback}
        busy={nas.busy}
        testConnection={nas.testConnection}
        save={nas.save}
      />
    </Screen>
  );
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  configBlock: { gap: 8 },
  configBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.ok,
  },
  configMeta: { flex: 1, gap: 2 },
  configTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  configSummary: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  saveShareBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 10,
  },
  saveShareLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  choice: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { backgroundColor: colors.sheetRaised, borderColor: colors.ruleLight },
  choiceLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  choiceLabelActive: { color: colors.ink },
});
