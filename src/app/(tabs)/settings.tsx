import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActiveProjects, useProductivity } from "@/lib/productivity/productivity-context";
import { useWealth } from "@/lib/wealth/wealth-context";
import { DownloadSheet } from "@/components/settings/download-sheet";
import { NasExplorerSheet } from "@/components/settings/nas-explorer-sheet";
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
import { useI18n } from "@/lib/i18n/context";
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
  const { t, locale, setLocale } = useI18n();
  const { settings, setSettings, password, setPassword, feedback, connected, videoConnected, wealthConnected, focusConnected } = nas;
  const [configOpen, setConfigOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [pushSummary, setPushSummary] = useState(() => t("settings.pushIdle"));
  const videoSettings = videoSourceSettings(settings);
  const podcastSettings = podcastSourceSettings(settings);
  const wealthSettings = wealthSourceSettings(settings);
  const focusSettings = focusSourceSettings(settings);
  const shareReady = connected && settings.sourceKind === "webdav";
  const videoReady = videoConnected;
  const downloadSummary = download.settings.enabled
    ? `${download.settings.host}:${download.settings.port}`
    : t("common.disabled");

  useEffect(() => {
    if (settings.sourceKind === "webdav") return;
    setSettings({
      ...settings,
      sourceKind: "webdav",
      port: settings.port === "4533" ? "5005" : settings.port || "5005",
      useHttps: false,
    });
  }, [setSettings, settings]);

  const localSummary = settings.localFolderUri
    ? settings.localFolderName || t("common.phoneFolder")
    : t("common.none");
  const podcastLocalSummary = settings.podcastLocalFolderUri
    ? settings.podcastLocalFolderName || t("common.phoneFolder")
    : settings.localFolderUri
      ? `${settings.localFolderName || t("settings.music")} / ${t("explorer.podcasts")}`
      : t("common.none");
  const videoLocalSummary = settings.videoLocalFolderUri
    ? settings.videoLocalFolderName || t("common.phoneFolder")
    : t("common.none");
  const wealthLocalSummary = settings.wealthLocalFolderUri
    ? settings.wealthLocalFolderName || t("common.phoneFolder")
    : t("common.none");
  const focusLocalSummary = settings.focusLocalFolderUri
    ? settings.focusLocalFolderName || t("common.phoneFolder")
    : t("common.none");
  const nasFeedback = feedback?.text;
  const downloadFeedback = download.feedback && !downloadOpen ? download.feedback.text : null;
  const mediaZone = zone === "focus" || zone === "wealth" ? "music" : zone;
  const zoneReady = offline.readyTracks.filter((item) => item.kind === mediaZone).length;
  const offlineCountLabel = (n: number) =>
    mediaZone === "podcast"
      ? t(n === 1 ? "settings.podcastOne" : "settings.podcastMany", { count: n })
      : mediaZone === "video"
        ? t(n === 1 ? "settings.chapterOne" : "settings.chapterMany", { count: n })
        : t(n === 1 ? "settings.songOne" : "settings.songMany", { count: n });
  const offlineSummary = zoneReady
    ? `${offlineCountLabel(zoneReady)} · ${formatOfflineBytes(offline.readyTracks.filter((item) => item.kind === mediaZone).reduce((sum, item) => sum + item.localBytes, 0))}`
    : mediaZone === "video"
      ? t("settings.offlineEmptyVideo")
      : t("settings.offlineEmpty");
  const hasLocalFolder =
    zone === "video"
      ? Boolean(settings.videoLocalFolderUri)
      : zone === "podcast"
        ? Boolean(settings.podcastLocalFolderUri || settings.localFolderUri)
        : Boolean(settings.localFolderUri);
  const offlineHint =
    zone === "video"
      ? t("settings.offlineHintVideo")
      : hasLocalFolder
        ? t("settings.offlineHintLocal")
        : t("settings.offlineHintNas");

  const pathSummary = (host: string, port: string, path: string) =>
    path ? `${host}:${port} · ${path}` : `${host}:${port} · ${t("common.noPath")}`;
  const musicSummary = pathSummary(settings.host, settings.port, settings.sharePath);
  const podcastSummary = pathSummary(podcastSettings.host, podcastSettings.port, podcastSettings.sharePath);
  const videoSummary = pathSummary(videoSettings.host, videoSettings.port, videoSettings.sharePath);
  const wealthSummary = pathSummary(wealthSettings.host, wealthSettings.port, wealthSettings.sharePath);
  const focusSummary = pathSummary(focusSettings.host, focusSettings.port, focusSettings.sharePath);

  const sendTest = async () => {
    if (pushStatus === "sending") return;
    setPushStatus("sending");
    setPushSummary(t("settings.pushSending"));
    const result = await sendTestPush();
    setPushStatus(result.ok ? "ok" : "error");
    setPushSummary(result.message);
  };

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={[type.pageTitle, styles.title]}>{t("settings.title")}</Text>
        <ZoneSwitch />
      </View>

      <View style={styles.groups}>
        {zone === "focus" ? (
          <>
            <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title={t("settings.shareFolder")}
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
                title={t("settings.localFolder")}
                summary={focusLocalSummary}
                ready={Boolean(settings.focusLocalFolderUri)}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setLocalOpen(true);
                }}
              />
            </SettingsGroup>
            <SettingsGroup label={t("settings.data")} hint={t("settings.focusDataHint")}>
              <SettingsRow
                title={t("settings.projects")}
                summary={
                  projects.length
                    ? t(projects.length === 1 ? "settings.projectOne" : "settings.projectMany", {
                        count: projects.length,
                      })
                    : t("settings.inboxOnly")
                }
                onPress={() => {
                  triggerUiHaptic();
                  router.push("/projects");
                }}
              />
              <View style={styles.divider} />
              <SettingsRow
                title={t("settings.clearDone")}
                summary={t("settings.clearDoneSummary")}
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
            <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title={t("settings.shareFolder")}
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
                title={t("settings.localFolder")}
                summary={wealthLocalSummary}
                ready={Boolean(settings.wealthLocalFolderUri)}
                showStatus
                onPress={() => {
                  triggerUiHaptic();
                  setLocalOpen(true);
                }}
              />
            </SettingsGroup>
            <SettingsGroup label={t("settings.data")} hint={t("settings.wealthDataHint")}>
            <SettingsRow
              title={t("settings.assets")}
              summary={
                positions.length
                  ? t(positions.length === 1 ? "settings.positionOne" : "settings.positionMany", {
                      count: positions.length,
                    })
                  : t("common.none")
              }
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/assets");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title={t("settings.activity")}
              summary={
                txs.length
                  ? t(txs.length === 1 ? "settings.txOne" : "settings.txMany", { count: txs.length })
                  : t("common.noneMasc")
              }
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/activity");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title={t("settings.accounts")}
              summary={t(
                accounts.filter((item) => !item.archived).length === 1
                  ? "settings.accountOne"
                  : "settings.accountMany",
                { count: accounts.filter((item) => !item.archived).length },
              )}
              onPress={() => {
                triggerUiHaptic();
                router.push("/wealth/accounts");
              }}
            />
            <View style={styles.divider} />
            <SettingsRow
              title={t("settings.goals")}
              summary={
                goalProgress.length
                  ? t(goalProgress.length === 1 ? "settings.goalOne" : "settings.goalMany", {
                      count: goalProgress.length,
                    })
                  : t("common.noneMasc")
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
          <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
            <SettingsRow
              title={t("settings.shareFolder")}
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
              title={t("settings.localFolder")}
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
            <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
              <SettingsRow
                title={t("settings.shareFolder")}
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
                title={t("settings.localFolder")}
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
          <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
            <SettingsRow
              title={t("settings.videoFolder")}
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
              title={t("settings.localFolder")}
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
            <SettingsGroup label={t("settings.download")} hint={downloadFeedback} hintColor={download.feedback?.color}>
              <SettingsRow
                title={t("settings.ytdlp")}
                summary={downloadSummary}
                ready={download.settings.enabled}
                onPress={() => {
                  triggerUiHaptic();
                  setDownloadOpen(true);
                }}
              />
            </SettingsGroup>

            <SettingsGroup label={t("settings.offline")} hint={offlineHint}>
              <SettingsRow
                title={
                  zone === "video"
                    ? t("settings.onPhone")
                    : zone === "podcast"
                      ? t("settings.episodes")
                      : t("settings.music")
                }
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

        <SettingsGroup label={t("settings.zones")}>
          <SettingsRow
            title={t("settings.zonePicker")}
            summary={zoneVisibilitySummary(enabled, t)}
            onPress={() => {
              triggerUiHaptic();
              setZonesOpen(true);
            }}
          />
        </SettingsGroup>

        <SettingsGroup
          label={t("settings.app")}
          hint={
            update.apkStatus === "apk"
              ? t("settings.apkHint")
              : update.otaStatus === "available"
                ? t("settings.otaHint")
                : null
          }
        >
          <SettingsRow
            title={t("settings.version")}
            summary={update.buildLabel}
            chevron={false}
            onPress={() => {
              triggerUiHaptic();
              void update.refresh();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title={t("settings.apk")}
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
            title={t("settings.ota")}
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
            title={t("settings.notifications")}
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
          <View style={styles.divider} />
          <SettingsRow
            title={t("language.title")}
            summary={locale === "es" ? t("language.spanish") : t("language.english")}
            onPress={() => {
              triggerUiHaptic();
              setLocale(locale === "en" ? "es" : "en");
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title={t("settings.folders")}
            summary={t("settings.foldersHint")}
            onPress={() => {
              triggerUiHaptic();
              setExplorerOpen(true);
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            title={t("settings.onboarding")}
            summary={t("settings.onboardingReplay")}
            onPress={() => {
              triggerUiHaptic();
              void nas.replayOnboarding();
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
      <NasExplorerSheet
        open={explorerOpen}
        onOpenChange={setExplorerOpen}
        settings={settings}
        password={password}
      />
      <ConfirmDialog
        open={clearOpen}
        title={t("settings.clearDoneTitle")}
        message={t("settings.clearDoneMessage")}
        confirmLabel={t("settings.clearDoneAction")}
        cancelLabel={t("common.cancel")}
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
  const { t } = useI18n();
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
    <View style={styles.statusWrap} accessibilityLabel={on ? t("common.connected") : t("common.disconnected")}>
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
