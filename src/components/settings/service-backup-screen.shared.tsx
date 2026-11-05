import { withExclusiveRestore } from "@/lib/backend/native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { ChevronLeft } from "lucide-react-native";
import { Text } from "@/components/ui/themed-text";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { useI18n } from "@/lib/i18n/context";
import { useSettings } from "@/lib/settings/settings-context";
import { SERVICES, usesLocal, usesNas } from "@/lib/settings/service-source";
import type { ServiceId } from "@/lib/settings/storage";
import { colors, type } from "@/lib/theme";
import { formatOfflineBytes } from "@/lib/offline/downloader";
import { createArchivePlan } from "@/lib/service-backup/plan";
import { restoreService } from "@/lib/service-backup/restore";
import {
  archiveSummary,
  validateServiceArchive,
} from "@/lib/service-backup/model";
import {
  assertArchiveAvailable,
  archiveProgress,
  cancelArchive,
  discardArchive,
  exportArchive,
  prepareArchive,
  type ArchiveStage,
  type ArchiveProgress,
} from "@/lib/service-backup/native";
import {
  backupDestination,
  backupName,
  pickServiceBackup,
  pickBackupDestinationFolder,
  tempArchiveUri,
  removeArchiveFile,
  saveHealthNas,
  loadHealthNas,
} from "@/lib/service-backup/io";

export function ServiceBackupScreen() {
  useThemeId();
  const router = useRouter();
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{ service?: string }>();
  const service: ServiceId = SERVICES.includes(params.service as ServiceId)
    ? (params.service as ServiceId)
    : "health";
  const { settings, password, setSettings, reloadSource } = useSettings();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<ArchiveProgress>({
    bytes: 0,
    files: 0,
  });
  const [preview, setPreview] = useState<{
    stage: ArchiveStage;
    createdAt: string;
    summary: ReturnType<typeof archiveSummary>;
  } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const job = useRef("");
  const cancelled = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    let last = 0;
    const event = archiveProgress((value) => {
      const now = Date.now();
      if (now - last >= 100) {
        last = now;
        setProgress(value);
      }
    });
    return () => {
      event.remove();
      cancelled.current = true;
      cancelArchive(job.current);
      const stage = previewRef.current?.stage;
      if (stage) void discardArchive(stage).catch(() => {});
    };
  }, []);
  useEffect(() => {
    const event = BackHandler.addEventListener(
      "hardwareBackPress",
      () => locked.current,
    );
    return () => event.remove();
  }, []);
  function begin() {
    if (locked.current) return false;
    locked.current = true;
    cancelled.current = false;
    job.current = Crypto.randomUUID();
    setBusy(true);
    setError(false);
    setStatus(null);
    setProgress({ bytes: 0, files: 0 });
    return true;
  }
  function end() {
    locked.current = false;
    setBusy(false);
  }
  function check() {
    if (cancelled.current) throw new Error("cancelled");
  }
  function fail(err: unknown) {
    const message = err instanceof Error ? err.message : "storage";
    const code =
      [
        "cancelled",
        "nativeUpdate",
        "sourceUnreadable",
        "integrity",
        "format",
        "space",
        "size",
        "accountChanged",
        "destination",
      ].find((code) => message.includes(code)) ?? "storage";
    setError(code !== "cancelled");
    setStatus(t(`serviceBackup.${code}`));
  }
  async function save(target: "file" | "local" | "nas" = "file") {
    if (!begin()) return;
    let uri: string | null = null;
    try {
      assertArchiveAvailable();
      uri =
        target === "nas"
          ? tempArchiveUri()
          : await backupDestination(
              backupName(service),
              target === "local" ? settings.healthLocalFolderUri : undefined,
            );
      if (!uri) return;
      check();
      const plan = await createArchivePlan(service, settings, password, check);
      check();
      await exportArchive(
        uri,
        plan.data,
        plan.files,
        job.current,
        plan.authorize,
      );
      check();
      if (target === "nas") await saveHealthNas(uri, settings, password);
      setStatus(t("serviceBackup.saved"));
    } catch (err) {
      if (uri) await removeArchiveFile(uri);
      fail(err);
    } finally {
      if (uri && target === "nas") await removeArchiveFile(uri);
      end();
    }
  }
  async function open(nas = false) {
    if (!begin()) return;
    let stage: ArchiveStage | null = null;
    let temporary: string | null = null;
    try {
      assertArchiveAvailable();
      const picked = nas
        ? { uri: (temporary = await loadHealthNas(settings, password)) }
        : await pickServiceBackup();
      if (!picked) return;
      check();
      stage = await prepareArchive(picked.uri, job.current);
      check();
      const data = validateServiceArchive(JSON.parse(stage.metadata), service);
      if (
        Object.keys(stage.files).length !== data.files.length ||
        data.files.some((path) => !stage!.files[path])
      )
        throw new Error("integrity");
      setPreview({
        stage,
        createdAt: data.createdAt,
        summary: archiveSummary(data),
      });
      stage = null;
    } catch (err) {
      fail(err);
    } finally {
      if (stage) await discardArchive(stage).catch(() => {});
      if (temporary) await removeArchiveFile(temporary);
      end();
    }
  }
  async function dismiss() {
    if (locked.current) return;
    const current = previewRef.current;
    setPreview(null);
    previewRef.current = null;
    if (current) await discardArchive(current.stage).catch(() => {});
  }
  async function apply() {
    const current = previewRef.current;
    if (!current || !begin()) return;
    try {
      const media = ["music", "podcast", "video"].includes(service);
      const destination =
        media && current.summary.files
          ? await pickBackupDestinationFolder()
          : null;
      if (media && current.summary.files && !destination) return;
      check();
      const next = await withExclusiveRestore(() => restoreService(
        current.stage,
        service,
        settings,
        destination,
        job.current,
      ));
      if (next !== settings) {
        setSettings(next);
        reloadSource();
      }
      setPreview(null);
      previewRef.current = null;
      await discardArchive(current.stage);
      setStatus(t("serviceBackup.imported"));
    } catch (err) {
      fail(err);
    } finally {
      end();
    }
  }
  const summary = preview?.summary ?? null;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.back")}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View style={styles.text}>
          <Text style={type.pageTitle}>{t("serviceBackup.title")}</Text>
          <Text style={type.meta}>{t(`zones.${service}`)}</Text>
        </View>
      </View>
      <Text style={type.body}>{t("serviceBackup.scope")}</Text>
      <View style={styles.card}>
        <Action
          label={t("serviceBackup.export")}
          hint={t("serviceBackup.exportHint")}
          busy={busy || !!preview}
          onPress={() => void save()}
        />
        <Action
          label={t("serviceBackup.import")}
          hint={t("serviceBackup.importHint")}
          busy={busy || !!preview}
          onPress={() => void open()}
        />
      </View>
      {service === "health" ? (
        <>
          <Text style={type.label}>{t("settings.source")}</Text>
          <View style={styles.card}>
            {usesLocal(settings, "health") && settings.healthLocalFolderUri ? (
              <Action
                label={t("serviceBackup.saveFolder")}
                hint={settings.healthLocalFolderName || ""}
                busy={busy || !!preview}
                onPress={() => void save("local")}
              />
            ) : null}
            {usesNas(settings, "health") && settings.healthSharePath ? (
              <>
                <Action
                  label={t("serviceBackup.saveNas")}
                  hint={settings.healthSharePath}
                  busy={busy || !!preview}
                  onPress={() => void save("nas")}
                />
                <Action
                  label={t("serviceBackup.openNas")}
                  busy={busy || !!preview}
                  onPress={() => void open(true)}
                />
              </>
            ) : null}
            <Action
              label={t("serviceBackup.legacyHealth")}
              busy={busy}
              onPress={() => router.push("/health/backup")}
            />
          </View>
          <Text style={type.meta}>{t("localSetup.healthFolderHint")}</Text>
        </>
      ) : null}
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.accent} />
          <Text style={type.body}>
            {formatOfflineBytes(progress.bytes)} · {progress.files}{" "}
            {t(
              progress.files === 1
                ? "serviceBackup.file"
                : "serviceBackup.files",
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cancelled.current = true;
              cancelArchive(job.current);
            }}
            style={styles.button}
          >
            <Text style={type.body}>{t("serviceBackup.cancel")}</Text>
          </Pressable>
        </View>
      ) : null}
      {status ? (
        <Text
          accessibilityRole="alert"
          style={[type.body, { color: error ? colors.danger : colors.ok }]}
        >
          {status}
        </Text>
      ) : null}
      <ConfirmDialog
        open={!!preview}
        title={t("serviceBackup.confirmTitle")}
        destructive={false}
        message={
          preview && summary
            ? `${t(`zones.${service}`)} · ${new Date(preview.createdAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}\n${summary.records} ${t(summary.records === 1 ? "serviceBackup.record" : "serviceBackup.records")} · ${summary.files} ${t(summary.files === 1 ? "serviceBackup.file" : "serviceBackup.files")} · ${formatOfflineBytes(preview.stage.bytes)}\n\n${t("serviceBackup.confirmBody")}`
            : ""
        }
        confirmLabel={
          busy ? t("serviceBackup.working") : t("serviceBackup.import")
        }
        cancelLabel={t("serviceBackup.cancel")}
        busy={busy}
        onConfirm={() => void apply()}
        onCancel={() => void dismiss()}
      />
    </Screen>
  );
}
function Action({
  label,
  hint,
  busy,
  onPress,
}: {
  label: string;
  hint?: string;
  busy: boolean;
  onPress(): void;
}) {
  useThemeId();
  return (
    <Pressable
      disabled={busy}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { opacity: busy ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={type.track}>{label}</Text>
      {hint ? <Text style={type.meta}>{hint}</Text> : null}
    </Pressable>
  );
}
const styles = createStyles(() => ({
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  text: { flex: 1, gap: 4 },
  card: {
    borderColor: colors.rule,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  action: {
    padding: 14,
    minHeight: 52,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  busy: { gap: 12 },
  button: { minHeight: 44, padding: 10 },
}));
