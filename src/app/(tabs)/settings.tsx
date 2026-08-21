import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { DownloadSheet } from "@/components/settings/download-sheet";
import { SourceConfigSheet } from "@/components/settings/source-config-sheet";
import { Screen } from "@/components/ui/screen";
import { useDownloadSettings } from "@/hooks/use-download-settings";
import { useNasSettings } from "@/hooks/use-nas-settings";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout, type } from "@/lib/theme";
import type { MusicSourceKind } from "@/lib/nas/types";

const SOURCE_TABS: { id: MusicSourceKind; label: string }[] = [
  { id: "webdav", label: "Carpeta compartida" },
  { id: "mock", label: "Biblioteca de ejemplo" },
  { id: "opensubsonic", label: "Navidrome" },
];

export default function SettingsScreen() {
  const nas = useNasSettings();
  const download = useDownloadSettings();
  const { settings, setSettings, password, setPassword, feedback, connected } = nas;
  const [configOpen, setConfigOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const shareReady = connected && settings.sourceKind === "webdav";
  const canSaveShare = shareReady && !nas.busy;
  const downloadSummary = download.settings.enabled
    ? `${download.settings.host}:${download.settings.port}`
    : "Desactivado";

  function selectSource(kind: MusicSourceKind) {
    if (kind === "webdav") {
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
      return;
    }
    if (kind === "opensubsonic") {
      setSettings({
        ...settings,
        sourceKind: "opensubsonic",
        port: settings.port === "5005" ? "4533" : settings.port || "4533",
      });
      return;
    }
    setSettings({ ...settings, sourceKind: "mock" });
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
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {SOURCE_TABS.map((item) => {
          const active = settings.sourceKind === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => selectSource(item.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.configBlock}>
        <Pressable
          onPress={() => {
            triggerUiHaptic();
            setConfigOpen(true);
          }}
          style={({ pressed }) => [styles.configBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.statusDot, { opacity: shareReady ? 1 : 0 }]} />
          <View style={styles.configMeta}>
            <Text style={styles.configTitle}>Configuración</Text>
            <Text numberOfLines={1} style={styles.configSummary}>
              {summary}
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={20} />
        </Pressable>
        <Pressable
          disabled={!canSaveShare}
          onPress={() => {
            triggerUiHaptic();
            void nas.saveShareConfig();
          }}
          style={({ pressed }) => [
            styles.saveShareBtn,
            { opacity: !canSaveShare ? 0.45 : pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.saveShareLabel}>Guardar configuración</Text>
        </Pressable>
      </View>
      <Text style={[type.meta, styles.feedbackSlot, feedback ? { color: feedback.color } : null]}>
        {feedback?.text ?? " "}
      </Text>

      <Text style={type.sectionTitle}>Descargas</Text>
      <Pressable
        onPress={() => {
          triggerUiHaptic();
          setDownloadOpen(true);
        }}
        style={({ pressed }) => [styles.configBtn, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.statusDot, { opacity: download.settings.enabled ? 1 : 0 }]} />
        <View style={styles.configMeta}>
          <Text style={styles.configTitle}>yt-dlp</Text>
          <Text numberOfLines={1} style={styles.configSummary}>
            {downloadSummary}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>
      <Text
        style={[
          type.meta,
          styles.feedbackSlot,
          download.feedback && !downloadOpen ? { color: download.feedback.color } : null,
        ]}
      >
        {download.feedback && !downloadOpen ? download.feedback.text : " "}
      </Text>

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
      <DownloadSheet open={downloadOpen} onOpenChange={setDownloadOpen} download={download} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsScroll: {
    marginHorizontal: -layout.screenPad,
    flexGrow: 0,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: layout.screenPad,
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
  tabLabelActive: { color: colors.void },
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
  feedbackSlot: { minHeight: 18 },
});
