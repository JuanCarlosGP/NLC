import { remoteEnabled, PHONE_ONLY } from "@/lib/backend/profile";
import { DesktopWebInterface } from "@/components/settings/desktop-web-interface";
import { LocalMoveSheet } from "@/components/settings/local-move-sheet";
import { ServiceSourcePicker } from "@/components/settings/service-source-picker";
import { localFolder, usesNas, usesLocal } from "@/lib/settings/service-source";
import { healthSourceSettings, applyHealthSourceSettings } from "@/lib/settings/storage";
import { folderDisplayName, getWebDirectoryHandle } from "@/lib/local/pick-folder";
import { probeWebDav } from "@/lib/nas/webdav-source";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles, densityData } from "@/lib/appearance/density";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Monitor, SlidersHorizontal } from "lucide-react-native";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useActiveProjects, useProductivity } from "@/lib/productivity/productivity-context";
import { useWealth } from "@/lib/wealth/wealth-context";
import { DesktopWebTui } from "@/components/settings/desktop-web-tui";
import { DownloadSheet } from "@/components/settings/download-sheet";
import { NasExplorerSheet } from "@/components/settings/nas-explorer-sheet";
import { OfflineSheet } from "@/components/settings/offline-sheet";
import { LocalFolderSheet } from "@/components/settings/local-folder-sheet";
import { SourceConfigSheet } from "@/components/settings/source-config-sheet";
import { ZONE_ICONS, ZoneSwitch, ZoneVisibilitySheet, zoneVisibilitySummary } from "@/components/layout/zone-switch";
import { Screen } from "@/components/ui/screen";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useDownloadSettings } from "@/hooks/use-download-settings";
import { useNasSettings } from "@/hooks/use-nas-settings";
import { loadBridgeToken, loadDesktopHost, subscribeBridgeSession } from "@/lib/bridge/session";
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
import { useDock } from "@/lib/dock-context";
import { useZone, isMediaZone, type AppZone } from "@/lib/zone/zone-context";

type SettingsPanel = "service" | "preferences" | "device";

export default function SettingsScreen() {
  useThemeId();
  const router = useRouter();
  const update = useAppUpdate();
  const nas = useNasSettings();
  const download = useDownloadSettings();
  const offline = useOffline();
  const { zone, enabled } = useZone();
  const web = Platform.OS === "web";
  const standaloneWeb = web && !remoteEnabled;
  const hasSidebar = useDock()?.enabled === false;
  const [panel, setPanel] = useState<SettingsPanel>("service");
  useEffect(() => setPanel("service"), [zone]);
  const { clearDone } = useProductivity();
  const { positions, txs, accounts, goalProgress } = useWealth();
  const projects = useActiveProjects();
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const { t, locale, setLocale } = useI18n();
  const { settings, setSettings, password, setPassword, feedback, connected, videoConnected, wealthConnected, focusConnected } = nas;
  const [configOpen, setConfigOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [desktopLinked, setDesktopLinked] = useState(false);
  const [desktopSummary, setDesktopSummary] = useState(() => t("settings.desktopIdle"));
  const [pushStatus, setPushStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [pushSummary, setPushSummary] = useState(() => t("settings.pushIdle"));
  const videoSettings = videoSourceSettings(settings);
  const podcastSettings = podcastSourceSettings(settings);
  const wealthSettings = wealthSourceSettings(settings);
  const focusSettings = focusSourceSettings(settings);
  const healthSettings = healthSourceSettings(settings);
  const shareReady = connected && settings.sourceKind === "webdav";
  const videoReady = videoConnected;
  const downloadSummary = download.settings.enabled
    ? `${download.settings.host}:${download.settings.port}`
    : t("common.disabled");


  useEffect(() => {
    let cancelled = false;
    async function refreshDesktop() {
      const [token, host] = await Promise.all([loadBridgeToken(), loadDesktopHost()]);
      if (cancelled) return;
      if (token && host) {
        setDesktopLinked(true);
        setDesktopSummary(t("settings.desktopLinked", { host }));
      } else if (token) {
        setDesktopLinked(true);
        setDesktopSummary(t("settings.desktopListening"));
      } else {
        setDesktopLinked(false);
        setDesktopSummary(t("settings.desktopIdle"));
      }
    }
    void refreshDesktop();
    const unsub = subscribeBridgeSession(() => {
      void refreshDesktop();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [t]);

  const folder = localFolder(settings, zone);
  const musicFolder = localFolder(settings, "music");
  const inheritsMusicFolder = zone === "podcast" && !folder.uri && Boolean(musicFolder.uri);
  const localUri = inheritsMusicFolder ? musicFolder.uri : folder.uri;
  const localReady = Boolean(localUri && (!standaloneWeb || getWebDirectoryHandle(localUri)));
  const folderName = inheritsMusicFolder
    ? `${folderDisplayName(musicFolder.uri, musicFolder.name)} / ${t("explorer.podcasts")}`
    : folderDisplayName(folder.uri, folder.name);
  const localSummary = standaloneWeb && localUri && !localReady
    ? t("localFolder.reselect", { folder: folderName })
    : folderName || t(zone === "health" ? "localSetup.internal" : "common.none");
  const nasFeedback = feedback?.text;
  const downloadFeedback = download.feedback && !downloadOpen ? download.feedback.text : null;
  const mediaZone = isMediaZone(zone) ? zone : "music";
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

  const localSourceRow = standaloneWeb && !isMediaZone(zone) ? (
    <SettingsRow title={t("settings.data")} summary={t("localSetup.internalBrowser")} />
  ) : (
    <SettingsRow
      deviceOnly
      title={t(standaloneWeb ? "localFolder.computerTitle" : remoteEnabled ? "localFolder.phoneTitle" : "settings.localFolder")}
      summary={localSummary}
      ready={localReady}
      showStatus
      onPress={() => {
        triggerUiHaptic();
        setLocalOpen(true);
      }}
    />
  );

  const serviceGroups = (
    <>
      {web ? (
        <SettingsGroup label={t("localSetup.storage")}>
          <ServiceSourcePicker service={zone} showLabel={false} />
        </SettingsGroup>
      ) : <ServiceSourcePicker service={zone} />}
      {zone === "health" ? (
        <SettingsGroup label={t("settings.source")} hint={t(standaloneWeb ? "localSetup.healthFolderHintBrowser" : "localSetup.healthFolderHint")}>
          <SettingsRow title="WHOOP" summary={t("serviceBackup.whoopHint")} onPress={() => router.push("/health/whoop")} />
          <View style={styles.divider} {...densityData("settings-divider")} />
          {usesNas(settings, zone) ? <SettingsRow title={t("settings.shareFolder")} summary={settings.healthSharePath || t("common.none")} onPress={() => setConfigOpen(true)} /> : null}
          {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
          {usesLocal(settings, zone) ? localSourceRow : null}
        </SettingsGroup>
      ) : null}
      {zone === "focus" ? (
        <>
          <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
            {usesNas(settings, zone) ? <SettingsRow
              title={t("settings.shareFolder")}
              summary={focusSummary}
              ready={focusConnected}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setConfigOpen(true);
              }}
            /> : null}
            {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
            {usesLocal(settings, zone) ? localSourceRow : null}
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
            <View style={styles.divider} {...densityData("settings-divider")} />
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
            {usesNas(settings, zone) ? <SettingsRow
              title={t("settings.shareFolder")}
              summary={wealthSummary}
              ready={wealthConnected}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setConfigOpen(true);
              }}
            /> : null}
            {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
            {usesLocal(settings, zone) ? localSourceRow : null}
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
          <View style={styles.divider} {...densityData("settings-divider")} />
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
          <View style={styles.divider} {...densityData("settings-divider")} />
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
          <View style={styles.divider} {...densityData("settings-divider")} />
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
          {usesNas(settings, zone) ? <SettingsRow
            title={t("settings.shareFolder")}
            summary={musicSummary}
            ready={shareReady}
            showStatus
            onPress={() => {
              triggerUiHaptic();
              setConfigOpen(true);
            }}
          /> : null}
          {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
          {usesLocal(settings, zone) ? localSourceRow : null}
        </SettingsGroup>
      ) : null}

      {zone === "podcast" ? (
        <>
          <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
            {usesNas(settings, zone) ? <SettingsRow
              title={t("settings.shareFolder")}
              summary={podcastSummary}
              ready={shareReady}
              showStatus
              onPress={() => {
                triggerUiHaptic();
                setConfigOpen(true);
              }}
            /> : null}
            {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
            {usesLocal(settings, zone) ? localSourceRow : null}
          </SettingsGroup>
        </>
      ) : null}

      {zone === "video" ? (
        <SettingsGroup label={t("settings.source")} hint={nasFeedback} hintColor={feedback?.color}>
          {usesNas(settings, zone) ? <SettingsRow
            title={t("settings.videoFolder")}
            summary={videoSummary}
            ready={videoReady}
            showStatus
            onPress={() => {
              triggerUiHaptic();
              setConfigOpen(true);
            }}
          /> : null}
          {usesNas(settings, zone) && usesLocal(settings, zone) ? <View style={styles.divider} {...densityData("settings-divider")} /> : null}
          {usesLocal(settings, zone) ? localSourceRow : null}
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

          {!standaloneWeb && (
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
          )}
        </>
      ) : null}
    </>
  );
  const desktopGroup = (
    <SettingsGroup label={t("settings.desktop")}>
      <SettingsRow deviceOnly
        title={t("desktop.title")}
        summary={desktopSummary}
        ready={desktopLinked}
        showStatus
        onPress={() => {
          triggerUiHaptic();
          router.push("/desktop-bridge" as Href);
        }}
      />
      <View style={styles.divider} {...densityData("settings-divider")} />
      <DesktopWebTui />
      <View style={styles.divider} {...densityData("settings-divider")} />
      <DesktopWebInterface />
    </SettingsGroup>
  );
  const zonesGroup = (
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
  );
  const deviceRows = (
    <>
      <SettingsRow
        title={t("settings.version")}
        summary={update.buildLabel}
        chevron={false}
        onPress={() => {
          triggerUiHaptic();
          void update.refresh();
        }}
      />
      <View style={styles.divider} {...densityData("settings-divider")} />
      <SettingsRow deviceOnly
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
      <View style={styles.divider} {...densityData("settings-divider")} />
      <SettingsRow deviceOnly
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
      <View style={styles.divider} {...densityData("settings-divider")} />
      <SettingsRow deviceOnly
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
    </>
  );
  const languageRow = (
    <SettingsRow
      title={t("language.title")}
      summary={locale === "es" ? t("language.spanish") : t("language.english")}
      onPress={() => {
        triggerUiHaptic();
        setLocale(locale === "en" ? "es" : "en");
      }}
    />
  );
  const backupRow = (
    <SettingsRow title={t("serviceBackup.openSettings")} summary={`${t(`zones.${zone}`)} · ${t("serviceBackup.settingsHint")}`} onPress={() => router.push({ pathname: "/service-backup", params: { service: zone } } as Href)} />
  );
  const moveRow = (
    <SettingsRow deviceOnly title={t("localMove.title")} summary={settings.localRootFolderName || t("localSetup.generalFolder")} onPress={() => setMoveOpen(true)} />
  );
  const foldersRow = (
    usesNas(settings, zone) ? <SettingsRow
      title={t("settings.folders")}
      summary={t("settings.foldersHint")}
      onPress={() => {
        triggerUiHaptic();
        setExplorerOpen(true);
      }}
    /> : null
  );
  const onboardingRow = (
    <SettingsRow deviceOnly
      title={t("settings.onboarding")}
      summary={t("settings.onboardingReplay")}
      onPress={() => {
        triggerUiHaptic();
        void nas.replayOnboarding();
      }}
    />
  );
  const updateHint = update.apkStatus === "apk" ? t("settings.apkHint")
    : update.otaStatus === "available" ? t("settings.otaHint") : null;

  return (
    <Screen>
      {web ? (
        <WebSettingsHeader zone={zone} panel={panel} onChange={setPanel} showZoneSwitch={!hasSidebar} />
      ) : (
        <View style={styles.heading}>
          <Text style={[type.pageTitle, styles.title]}>{t("settings.title")}</Text>
          <ZoneSwitch />
        </View>
      )}

      {web ? (
        <View {...densityData("settings-workspace")}>
          {panel === "service" && (
            <>
              {serviceGroups}
              <SettingsGroup label={t("settings.storageTools")}>
                {backupRow}
                {foldersRow && <><View style={styles.divider} {...densityData("settings-divider")} />{foldersRow}</>}
              </SettingsGroup>
            </>
          )}
          {panel === "preferences" && (
            <>
              <SettingsGroup label={t("settings.presentation")}>
                {languageRow}
                <AppearancePicker />
              </SettingsGroup>
              {zonesGroup}
            </>
          )}
          {panel === "device" && (
            <>
              {desktopGroup}
              <SettingsGroup label={t("settings.app")} hint={updateHint}>
                {deviceRows}
                {!standaloneWeb && <><View style={styles.divider} {...densityData("settings-divider")} />{moveRow}</>}
                <View style={styles.divider} {...densityData("settings-divider")} />
                {onboardingRow}
              </SettingsGroup>
            </>
          )}
        </View>
      ) : (
        <View style={styles.groups}>
          {serviceGroups}
          {desktopGroup}
          {zonesGroup}
          <SettingsGroup label={t("settings.app")} hint={updateHint}>
            {deviceRows}
            <View style={styles.divider} {...densityData("settings-divider")} />
            {languageRow}
            <View style={styles.divider} {...densityData("settings-divider")} />
            {backupRow}
            <View style={styles.divider} {...densityData("settings-divider")} />
            {moveRow}
            <AppearancePicker />
            <View style={styles.divider} {...densityData("settings-divider")} />
            {foldersRow}
            <View style={styles.divider} {...densityData("settings-divider")} />
            {onboardingRow}
          </SettingsGroup>
        </View>
      )}
      {moveOpen ? <LocalMoveSheet onClose={() => setMoveOpen(false)} /> : null}

      <SourceConfigSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        settings={{ ...(
          zone === "health" ? healthSettings : zone === "video"
            ? videoSettings
            : zone === "podcast"
              ? podcastSettings
              : zone === "wealth"
                ? wealthSettings
                : zone === "focus"
                  ? focusSettings
                  : settings
        ), sourceKind: "webdav" }}
        setSettings={(next) =>
          setSettings(
            zone === "health" ? applyHealthSourceSettings(settings, next) : zone === "video"
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
          zone === "health" ? async () => {
            const ok = await probeWebDav(healthSettings, password);
            nas.setFeedback({ text: t(ok ? "serviceBackup.sourceReady" : "serviceBackup.sourceUnreadable"), color: ok ? colors.ok : colors.warn });
          } : zone === "video"
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
          zone === "health" ? async () => { await nas.persist(); const ok = await probeWebDav(healthSettings, password); nas.setFeedback({ text: t(ok ? "serviceBackup.sourceReady" : "serviceBackup.sourceUnreadable"), color: ok ? colors.ok : colors.warn }); } : zone === "video"
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
          zone === "health" ? "health" : zone === "video"
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
          zone === "health" ? "health" : zone === "video"
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
      <OfflineSheet open={offlineOpen} onOpenChange={setOfflineOpen} lockedKind={mediaZone} />
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

function WebSettingsHeader({ zone, panel, onChange, showZoneSwitch }: {
  zone: AppZone;
  panel: SettingsPanel;
  onChange: (panel: SettingsPanel) => void;
  showZoneSwitch: boolean;
}) {
  const { t } = useI18n();
  const sections = [
    { id: "service", label: t(`zones.${zone}`), Icon: ZONE_ICONS[zone] },
    { id: "preferences", label: t("settings.preferences"), Icon: SlidersHorizontal },
    { id: "device", label: t("settings.device"), Icon: Monitor },
  ] as const;
  return (
    <header className="nlc-settings-header">
      <div className="nlc-settings-heading">
        <h1>{t("settings.title")}</h1>
        {showZoneSwitch && <ZoneSwitch />}
      </div>
      <nav className="nlc-settings-nav" aria-label={t("settings.title")}>
        {sections.map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-pressed={panel === id} onClick={() => onChange(id)}>
            <Icon size={17} aria-hidden={true} />
            {label}
          </button>
        ))}
      </nav>
    </header>
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
  useThemeId();
  return (
    <View style={styles.group} {...densityData("settings-group")}>
      <Text accessibilityRole="header" style={styles.groupLabel} {...densityData("settings-group-title")}>{label}</Text>
      <View style={styles.card} {...densityData("settings-group-body")}>{children}</View>
      {hint ? <Text style={[styles.hint, hintColor ? { color: hintColor } : null]} {...densityData("settings-group-hint")}>{hint}</Text> : null}
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
  deviceOnly = false,
  onPress,
}: {
  title: string;
  summary: string;
  ready?: boolean;
  showStatus?: boolean;
  tone?: "ok" | "warn";
  chevron?: boolean;
  deviceOnly?: boolean;
  onPress?: () => void;
}) {
  useThemeId();
  const body = (
    <>
      <View style={styles.rowMeta} {...densityData("settings-row-meta")}>
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
          {remoteEnabled && deviceOnly ? PHONE_ONLY : summary}
        </Text>
      </View>
      {chevron ? <ChevronRight color={colors.muted} size={18} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row} {...densityData("settings-row")}>{body}</View>;
  }

  return (
    <Pressable {...densityData("settings-row")} accessibilityRole="button" disabled={remoteEnabled && deviceOnly} accessibilityState={{ disabled: remoteEnabled && deviceOnly }} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: remoteEnabled && deviceOnly ? 0.45 : pressed ? 0.82 : 1 }]}>
      {body}
    </Pressable>
  );
}

function StatusDot({ on }: { on: boolean }) {
  useThemeId();
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

const styles = createStyles(() => ({
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
}));
