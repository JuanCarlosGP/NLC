import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActiveProjects, useProductivity } from "@/lib/productivity/productivity-context";
import { useWealth } from "@/lib/wealth/wealth-context";
import { DownloadSheet } from "@/components/settings/download-sheet";
import { OfflineSheet } from "@/components/settings/offline-sheet";
import { LocalFolderSheet } from "@/components/settings/local-folder-sheet";
import { SourceConfigSheet } from "@/components/settings/source-config-sheet";
import { ZoneSwitch, ZoneVisibilitySheet, zoneVisibilitySummary } from "@/components/layout/zone-switch";
import { Screen } from "@/components/ui/screen";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useDownloadSettings } from "@/hooks/use-download-settings";
import { useNasSettings } from "@/hooks/use-nas-settings";
import { sendTestPush } from "@/lib/ota/test-push";
import { formatOfflineBytes } from "@/lib/offline/downloader";
import { useOffline } from "@/lib/offline/offline-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import {
  applyFocusSourceSettings,
  applyPodcastSourceSettings,
  applyVideoSourceSettings,
  applyWealthSourceSettings,
  focusSourceSettings,
  podcastSourceSettings,
  videoSourceSettings,
  wealthSourceSettings,
} from "@/lib/settings/storage";
import { colors, fonts, type } from "@/lib/theme";
import { USE_NATIVE_DRIVER } from "@/lib/use-native-driver";
import { useZone, isMediaZone } from "@/lib/zone/zone-context";

export default function SettingsScreen() {
  const router = useRouter();
  const update = useAppUpdate();
  const nas = useNasSettings();
  const download = useDownloadSettings();
  const offline = useOffline();
  const { zone, enabled } = useZone();
  const { clearDone } = useProductivity();
  const { positions, txs, accounts, goalProgress } = useWealth();
  const projects = useActiveProjects();
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const { settings, setSettings, password, setPassword, feedback, connected, videoConnected, wealthConnected, focusConnected } = nas;
  const [configOpen, setConfigOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [pushSummary, setPushSummary] = useState("Toca para enviar una prueba");
  const videoSettings = videoSourceSettings(settings);
  const podcastSettings = podcastSourceSettings(settings);
  const wealthSettings = wealthSourceSettings(settings);
  const focusSettings = focusSourceSettings(settings);
  const shareReady = connected && settings.sourceKind === "webdav";
  const videoReady = videoConnected;
  const downloadSummary = download.settings.enabled
    ? `${download.settings.host}:${download.settings.port}`
    : "Desactivado";

  useEffect(() => {
    if (settings.sourceKind === "webdav") return;
    setSettings({
      ...settings,
      sourceKind: "webdav",
      host: settings.host || "192.168.1.106",
      port: settings.port === "4533" ? "5005" : settings.port || "5005",
      username: settings.username || "Viewer",
      sharePath: settings.sharePath,
      useHttps: false,
    });
    if (!password) setPassword("Viewer");
  }, [password, setPassword, setSettings, settings]);

  const localSummary = settings.localFolderUri
    ? settings.localFolderName || "Carpeta del teléfono"
    : "Ninguna";
  const podcastLocalSummary = settings.podcastLocalFolderUri
    ? settings.podcastLocalFolderName || "Carpeta del teléfono"
    : settings.localFolderUri
      ? `${settings.localFolderName || "Música"} / Podcasts`
      : "Ninguna";
  const videoLocalSummary = settings.videoLocalFolderUri
    ? settings.videoLocalFolderName || "Carpeta del teléfono"
    : "Ninguna";
  const wealthLocalSummary = settings.wealthLocalFolderUri
    ? settings.wealthLocalFolderName || "Carpeta del teléfono"
    : "Ninguna";
  const focusLocalSummary = settings.focusLocalFolderUri
    ? settings.focusLocalFolderName || "Carpeta del teléfono"
    : "Ninguna";
  const nasFeedback = feedback?.text;
  const downloadFeedback = download.feedback && !downloadOpen ? download.feedback.text : null;
  const mediaZone = zone === "focus" || zone === "wealth" ? "music" : zone;
  const zoneReady = offline.readyTracks.filter((item) => item.kind === mediaZone).length;
  const offlineSummary = zoneReady
    ? `${zoneReady} ${mediaZone === "podcast" ? (zoneReady === 1 ? "podcast" : "podcasts") : mediaZone === "video" ? (zoneReady === 1 ? "capítulo" : "capítulos") : zoneReady === 1 ? "canción" : "canciones"} · ${formatOfflineBytes(offline.readyTracks.filter((item) => item.kind === mediaZone).reduce((sum, item) => sum + item.localBytes, 0))}`
    : mediaZone === "video"
      ? "Ningún capítulo en NLC"
      : "Nada guardado";
  const hasLocalFolder =
    zone === "video"
      ? Boolean(settings.videoLocalFolderUri)
      : zone === "podcast"
        ? Boolean(settings.podcastLocalFolderUri || settings.localFolderUri)
        : Boolean(settings.localFolderUri);
  const offlineHint =
    zone === "video"
      ? "La videoteca es la carpeta de vídeo. Aquí solo lo que guardas en NLC, capítulo a capítulo."
      : hasLocalFolder
        ? "Lo que NLC guarda del NAS en el teléfono. La carpeta local no entra: ya está aquí."
        : "Lo que NLC guarda del NAS en el teléfono, para oír sin estar en casa.";

  const pathSummary = (host: string, port: string, path: string) =>
    path ? `${host}:${port} · ${path}` : `${host}:${port} · Sin ruta`;
  const musicSummary = pathSummary(settings.host, settings.port, settings.sharePath);
  const podcastSummary = pathSummary(podcastSettings.host, podcastSettings.port, podcastSettings.sharePath);
  const videoSummary = pathSummary(videoSettings.host, videoSettings.port, videoSettings.sharePath);
  const wealthSummary = pathSummary(wealthSettings.host, wealthSettings.port, wealthSettings.sharePath);
  const focusSummary = pathSummary(focusSettings.host, focusSettings.port, focusSettings.sharePath);

  const sendTest = async () => {
    if (pushStatus === "sending") return;
    setPushStatus("sending");
    setPushSummary("Enviando prueba…");
    const result = await sendTestPush();
    setPushStatus(result.ok ? "ok" : "error");
    setPushSummary(result.message);
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[type.pageTitle, styles.title]}>Ajustes</Text>
        <ZoneSwitch />
      </View>

      <View style={styles.groups}>
        {zone === "focus" ? (
          <>
            <SettingsGroup label="Fuente" hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title="Carpeta compartida"
                summary={focusSummary}
                ready={focusConnected}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setConfigOpen(true);
                }}
              />
              <View style={styles.divider} />
              <SettingsRow
                title="Carpeta local"
                summary={focusLocalSummary}
                ready={Boolean(settings.focusLocalFolderUri)}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setLocalOpen(true);
                }}
              />
            </SettingsGroup>
            <SettingsGroup
              label="Datos"
              hint="Las tareas, proyectos y recordatorios viven en el teléfono. Si hay fuente, se copia nlc-tasks.json al NAS o a la carpeta del móvil."
            >
              <SettingsRow
                title="Proyectos"
                summary={
                  projects.length
                    ? `${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`
                    : "Solo la bandeja"
                }
                onPress={() => {
                  triggerUiHaptic();
                  router.push("/projects");
                }}
              />
              <View style={styles.divider} />
              <SettingsRow
                title="Vaciar hechas"
                summary="Borra las tareas marcadas como hechas"
                onPress={() => {
                  triggerUiHaptic();
                  setClearOpen(true);
                }}
              />
            </SettingsGroup>
          </>
        ) : null}

        {zone === "wealth" ? (
          <>
            <SettingsGroup label="Fuente" hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title="Carpeta compartida"
                summary={wealthSummary}
                ready={wealthConnected}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setConfigOpen(true);
                }}
              />
              <View style={styles.divider} />
              <SettingsRow
                title="Carpeta local"
                summary={wealthLocalSummary}
                ready={Boolean(settings.wealthLocalFolderUri)}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setLocalOpen(true);
                }}
              />
            </SettingsGroup>
            <SettingsGroup
              label="Datos"
              hint="Cuentas, movimientos, inversiones y objetivos viven en el teléfono. Si hay fuente, se copia nlc-wealth.json al NAS o a la carpeta del móvil."
            >
            <SettingsRow
              title="Inversiones"
              summary={
                positions.length
                  ? `${positions.length} ${positions.length === 1 ? "posición" : "posiciones"}`
                  : "Ninguna"
              }
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/assets");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title="Movimientos"
              summary={
                txs.length
                  ? `${txs.length} ${txs.length === 1 ? "apunte" : "apuntes"}`
                  : "Ninguno"
              }
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/activity");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title="Cuentas"
              summary={`${accounts.filter((item) => !item.archived).length} ${accounts.filter((item) => !item.archived).length === 1 ? "cuenta" : "cuentas"}`}
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/accounts");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title="Objetivos"
              summary={
                goalProgress.length
                  ? `${goalProgress.length} ${goalProgress.length === 1 ? "objetivo" : "objetivos"}`
                  : "Ninguno"
              }
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/goals");
              }}
            />
          </SettingsGroup>
          </>
        ) : null}

        {zone === "music" ? (
          <SettingsGroup label="Fuente" hint={nasFeedback} hintColor={feedback?.color}>
            <SettingsRow
              title="Carpeta compartida"
              summary={musicSummary}
              ready={shareReady}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setConfigOpen(true);
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title="Carpeta local"
              summary={localSummary}
              ready={Boolean(settings.localFolderUri)}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setLocalOpen(true);
              }}
            />
          </SettingsGroup>
        ) : null}

        {zone === "podcast" ? (
          <>
            <SettingsGroup label="Fuente" hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title="Carpeta compartida"
                summary={podcastSummary}
                ready={shareReady}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setConfigOpen(true);
                }}
              />
              <View style={styles.divider} />
              <SettingsRow
                title="Carpeta local"
                summary={podcastLocalSummary}
                ready={Boolean(settings.podcastLocalFolderUri || settings.localFolderUri)}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setLocalOpen(true);
                }}
              />
            </SettingsGroup>
          </>
        ) : null}

        {zone === "video" ? (
          <SettingsGroup label="Fuente" hint={nasFeedback} hintColor={feedback?.color}>
            <SettingsRow
              title="Carpeta de vídeo"
              summary={videoSummary}
              ready={videoReady}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setConfigOpen(true);
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title="Carpeta local"
              summary={videoLocalSummary}
              ready={Boolean(settings.videoLocalFolderUri)}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setLocalOpen(true);
              }}
            />
          </SettingsGroup>
        ) : null}

        {isMediaZone(zone) ? (
          <>
            <SettingsGroup label="Descargar" hint={downloadFeedback} hintColor={download.feedback?.color}>
              <SettingsRow
                title="yt-dlp"
                summary={downloadSummary}
                ready={download.settings.enabled}
                onPress={() => {
                  triggerUiHaptic();
                  setDownloadOpen(true);
                }}
              />
            </SettingsGroup>

            <SettingsGroup label="Espacio interno" hint={offlineHint}>
              <SettingsRow
                title={zone === "video" ? "En el teléfono" : zone === "podcast" ? "Episodios" : "Música"}
                summary={offlineSummary}
                ready={zoneReady > 0}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setOfflineOpen(true);
                }}
              />
            </SettingsGroup>
          </>
        ) : null}

        <SettingsGroup label="Apartados">
          <SettingsRow
            title="Selector de zona"
            summary={zoneVisibilitySummary(enabled)}
            onPress={() => {
              triggerUiHaptic();
              setZonesOpen(true);
            }}
          />
        </SettingsGroup>

        <SettingsGroup
          label="App"
          hint={
            update.apkStatus === "apk"
              ? "La app baja NLC.apk de GitHub y abre el instalador. Hay que confirmar en el teléfono."
              : update.otaStatus === "available"
                ? "La OTA actualiza la app sin instalar otra APK."
                : null
          }
        >
          <SettingsRow
            title="Versión"
            summary={update.buildLabel}
            chevron={false}
            onPress={() => {
              triggerUiHaptic();
              void update.refresh();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title="APK"
            summary={update.apkSummary}
            ready={update.apkStatus === "current"}
            showStatus={update.apkStatus === "current" || update.apkStatus === "apk"}
            tone={update.apkStatus === "apk" ? "warn" : update.apkStatus === "current" ? "ok" : undefined}
            chevron={update.apkStatus === "apk"}
            onPress={() => {
              triggerUiHaptic();
              if (update.apkStatus === "apk" || update.apkError) update.downloadApk();
              else void update.refresh();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title="OTA"
            summary={update.otaSummary}
            ready={update.otaStatus === "current"}
            showStatus={update.otaStatus === "current" || update.otaStatus === "available"}
            tone={update.otaStatus === "available" ? "warn" : update.otaStatus === "current" ? "ok" : undefined}
            chevron={update.otaStatus === "available"}
            onPress={() => {
              triggerUiHaptic();
              if (update.otaStatus === "available") void update.applyOta();
              else void update.refresh();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title="Notificaciones"
            summary={pushSummary}
            ready={pushStatus === "ok"}
            showStatus={pushStatus === "ok" || pushStatus === "error"}
            tone={pushStatus === "error" ? "warn" : pushStatus === "ok" ? "ok" : undefined}
            chevron={false}
            onPress={() => {
              triggerUiHaptic();
              void sendTest();
            }}
          />
        </SettingsGroup>
      </View>

      <SourceConfigSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        settings={
          zone === "video"
            ? videoSettings
            : zone === "podcast"
              ? podcastSettings
              : zone === "wealth"
                ? wealthSettings
                : zone === "focus"
                  ? focusSettings
                  : settings
        }
        setSettings={(next) =>
          setSettings(
            zone === "video"
              ? applyVideoSourceSettings(settings, next)
              : zone === "podcast"
                ? applyPodcastSourceSettings(settings, next)
                : zone === "wealth"
                  ? applyWealthSourceSettings(settings, next)
                  : zone === "focus"
                    ? applyFocusSourceSettings(settings, next)
                    : next,
          )
        }
        password={password}
        setPassword={setPassword}
        feedback={nas.feedback}
        busy={nas.busy}
        testConnection={
          zone === "video"
            ? nas.testVideoConnection
            : zone === "podcast"
              ? nas.testPodcastConnection
              : zone === "wealth"
                ? nas.testWealthConnection
                : zone === "focus"
                  ? nas.testFocusConnection
                  : nas.testConnection
        }
        save={
          zone === "video"
            ? async () => {
                await nas.persist();
                await nas.testVideoConnection();
              }
            : zone === "wealth"
              ? nas.saveWealthSource
              : zone === "focus"
                ? nas.saveFocusSource
                : nas.save
        }
        variant={
          zone === "video"
            ? "video"
            : zone === "podcast"
              ? "podcast"
              : zone === "wealth"
                ? "wealth"
                : zone === "focus"
                  ? "focus"
                  : "music"
        }
      />
      <LocalFolderSheet
        open={localOpen}
        onOpenChange={setLocalOpen}
        settings={settings}
        applyLocalFolder={nas.applyLocalFolder}
        busy={nas.busy}
        feedback={nas.feedback}
        variant={
          zone === "video"
            ? "video"
            : zone === "podcast"
              ? "podcast"
              : zone === "wealth"
                ? "wealth"
                : zone === "focus"
                  ? "focus"
                  : "music"
        }
      />
      <DownloadSheet open={downloadOpen} onOpenChange={setDownloadOpen} download={download} zone={zone} />
      <OfflineSheet open={offlineOpen} onOpenChange={setOfflineOpen} lockedKind={zone === "focus" || zone === "wealth" ? "music" : zone} />
      <ZoneVisibilitySheet open={zonesOpen} onOpenChange={setZonesOpen} />
      <ConfirmDialog
        open={clearOpen}
        title="Vaciar hechas"
        message="Se borran las tareas en Hecho. No se pueden recuperar."
        confirmLabel="Vaciar"
        cancelLabel="Cancelar"
        destructive
        busy={clearBusy}
        onCancel={() => {
          if (!clearBusy) setClearOpen(false);
        }}
        onConfirm={() => {
          setClearBusy(true);
          void clearDone()
            .then(() => setClearOpen(false))
            .finally(() => setClearBusy(false));
        }}
      />
    </Screen>
  );
}

function SettingsGroup({
  label,
  hint,
  hintColor,
  children,
}: {
  label: string;
  hint?: string | null;
  hintColor?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
      {hint ? <Text style={[styles.hint, hintColor ? { color: hintColor } : null]}>{hint}</Text> : null}
    </View>
  );
}

function SettingsRow({
  title,
  summary,
  ready,
  showStatus,
  tone,
  chevron = true,
  onPress,
}: {
  title: string;
  summary: string;
  ready?: boolean;
  showStatus?: boolean;
  tone?: "ok" | "warn";
  chevron?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowMeta}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {ready || showStatus ? <StatusDot on={Boolean(ready)} /> : null}
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.rowSummary,
            tone === "warn" ? styles.rowSummaryWarn : tone === "ok" ? styles.rowSummaryOk : null,
          ]}
        >
          {summary}
        </Text>
      </View>
      {chevron ? <ChevronRight color={colors.muted} size={18} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.82 : 1 }]}>
      {body}
    </Pressable>
  );
}

function StatusDot({ on }: { on: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!on) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, pulse]);

  return (
    <View style={styles.statusWrap} accessibilityLabel={on ? "Conectado" : "Sin conexión"}>
      {on ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.statusRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
            },
          ]}
        />
      ) : null}
      <View style={on ? styles.statusDot : styles.statusDotOff} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { flex: 1 },
  groups: {
    gap: 28,
  },
  group: {
    gap: 10,
  },
  groupLabel: {
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowMeta: {
    flex: 1,
    gap: 3,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  rowSummary: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  rowSummaryWarn: { color: colors.warn },
  rowSummaryOk: { color: colors.ok },
  statusWrap: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRing: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.ok,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.ok,
  },
  statusDotOff: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginLeft: 16,
  },
  hint: {
    ...type.meta,
    paddingHorizontal: 2,
  },
});
