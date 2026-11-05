import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Text } from "@/components/ui/themed-text";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { useI18n } from "@/lib/i18n/context";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, type } from "@/lib/theme";
import { pickLocalFolder } from "@/lib/local/pick-folder";
import { prepareLocalRoot } from "@/lib/local/root-folder";
import { SERVICES, localFolder } from "@/lib/settings/service-source";
import { loadNasSettings, type NasSettings } from "@/lib/settings/storage";
import { formatOfflineBytes } from "@/lib/offline/downloader";
import {
  moveNative,
  type MoveSummary,
  type MoveProgress,
} from "@/lib/local/move/native";
import {
  prepareMove,
  commitMove,
  finishMove,
  abortMove,
  recoverMoves,
  keepMoveOriginals,
} from "@/lib/local/move/service";

export function LocalMoveSheet({
  target: draft,
  onClose,
  onCommitted,
  initialJob,
}: {
  target?: NasSettings;
  onClose(): void;
  onCommitted?(settings: NasSettings): void;
  initialJob?: MoveSummary;
}) {
  useThemeId();
  const { t } = useI18n(),
    insets = useSafeAreaInsets();
  const { settings, setSettings, reloadSource } = useSettings();
  const [target, setTarget] = useState(
    initialJob?.metadata.target ?? draft ?? settings,
  );
  const [job, setJob] = useState<MoveSummary | null>(initialJob ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState<MoveProgress | null>(null),
    [done, setDone] = useState(false);
  const id = useRef(initialJob?.id ?? Crypto.randomUUID()),
    cancelled = useRef(false),
    locked = useRef(false);
  useEffect(() => {
    try {
      const sub = moveNative().addListener("onLocalMoveProgress", (event) => {
        if (event.id === id.current) setProgress(event);
      });
      return () => sub.remove();
    } catch {}
  }, []);
  const committed = (next: NasSettings) => {
    setSettings(next);
    reloadSource();
    onCommitted?.(next);
  };
  async function run(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    cancelled.current = false;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e);
      const codes = [
        "cancelled",
        "space",
        "integrity",
        "sourceChanged",
        "settingsChanged",
        "sourceUnreadable",
        "nativeUpdate",
        "mirrorConflict",
        "size",
        "busy",
        "conflict",
      ];
      setError(
        t(
          `localMove.${codes.find((code) => message.includes(code)) ?? "storage"}`,
        ),
      );
      try {
        const jobs = await recoverMoves();
        const pending = jobs.find((item) => item.id === id.current);
        if (pending) setJob(pending);
      } catch {}
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function plan() {
    moveNative();
    const pending = await recoverMoves();
    if (pending.length) {
      id.current = pending[0].id;
      setJob(pending[0]);
      setTarget(pending[0].metadata.target);
      return;
    }
    let next = target;
    if (!next.localRootFolderUri) {
      const folder = await pickLocalFolder({ writable: true });
      if (!folder) return;
      next = await prepareLocalRoot(settings, folder);
      setTarget(next);
    }
    setJob(
      await prepareMove(settings, next, id.current, () => cancelled.current),
    );
  }
  async function transfer() {
    if (!job) return;
    if (job.state === "committed") {
      committed(await loadNasSettings());
      const result = await finishMove(job, () => cancelled.current);
      setJob(result);
      setDone(result.state === "done");
      return;
    }
    // Refresh the inventory and checksums after a preview or a process restart.
    const prepared = await prepareMove(
      settings,
      job.metadata.target,
      job.id,
      () => cancelled.current,
    );
    setJob(prepared);
    if (cancelled.current) throw new Error("cancelled");
    const result = await commitMove(
      prepared,
      () => cancelled.current,
      committed,
    );
    setJob(result);
    setDone(result.state === "done");
  }
  const close = () => {
    if (!locked.current && (!job || done)) onClose();
  };
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View
        style={[
          styles.body,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={type.pageTitle}>{t("localMove.title")}</Text>
          <Text style={type.body}>
            {t(done ? "localMove.done" : "localMove.scope")}
          </Text>
          <View style={styles.card}>
            <Text style={type.label}>{t("localMove.destination")}</Text>
            <Text style={type.track}>
              {target.localRootFolderName || t("localSetup.pick")}
            </Text>
          </View>
          {!job && !busy && target.localRootFolderUri ? (
            <Pressable
              style={styles.button}
              onPress={() =>
                void run(async () => {
                  const folder = await pickLocalFolder({ writable: true });
                  if (folder)
                    setTarget(await prepareLocalRoot(settings, folder));
                })
              }
            >
              <Text style={type.body}>{t("localMove.changeFolder")}</Text>
            </Pressable>
          ) : null}
          {!done ? (
            <View style={styles.card}>
              <Text style={type.label}>{t("localMove.origins")}</Text>
              {SERVICES.map((service) => (
                <Text key={service} style={type.meta}>
                  {t(`zones.${service}`)} ·{" "}
                  {localFolder(settings, service).name ||
                    t("localSetup.internal")}
                </Text>
              ))}
              <Text style={type.meta}>{t("localMove.privateData")}</Text>
            </View>
          ) : null}
          {job && !done ? (
            <View style={styles.card}>
              <Text style={type.track}>
                {job.files} {t("localMove.files")} ·{" "}
                {formatOfflineBytes(job.bytes)}
              </Text>
              <Text style={type.body}>
                {t(
                  job.state === "committed"
                    ? "localMove.committed"
                    : "localMove.confirm",
                )}
              </Text>
              {job.retained ? (
                <Text style={type.body}>
                  {job.retained} · {t("localMove.retained")}
                </Text>
              ) : null}
            </View>
          ) : null}
          {busy ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.ink} />
              <Text accessibilityLiveRegion="polite" style={type.body}>
                {t(`localMove.${progress?.phase ?? "prepare"}`)}
                {progress
                  ? ` · ${progress.files} · ${formatOfflineBytes(progress.bytes)}`
                  : ""}
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[type.body, { color: colors.danger }]}
            >
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          {!busy && !done ? (
            <Pressable
              accessibilityRole="button"
              style={styles.primary}
              onPress={() => void run(job ? transfer : plan)}
            >
              <Text style={[type.track, { color: colors.accentText }]}>
                {t(
                  job
                    ? job.state === "committed"
                      ? "localMove.resume"
                      : "localMove.move"
                    : "localMove.review",
                )}
              </Text>
            </Pressable>
          ) : null}
          {busy ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                cancelled.current = true;
                moveNative().cancelLocalMove(id.current);
              }}
            >
              <Text style={type.body}>{t("localMove.stop")}</Text>
            </Pressable>
          ) : null}
          {!busy && job && !done && error ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                void run(async () => {
                  await pickLocalFolder({ writable: true });
                })
              }
            >
              <Text style={type.body}>{t("localMove.regrant")}</Text>
            </Pressable>
          ) : null}
          {!busy && job && !done && job.state !== "committed" ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                void run(async () => {
                  const result = await abortMove(job.id);
                  setJob(null);
                  id.current = Crypto.randomUUID();
                  if (result.kept) setError(t("localMove.abortKept"));
                  else onClose();
                })
              }
            >
              <Text style={type.body}>{t("localMove.cancel")}</Text>
            </Pressable>
          ) : null}
          {!busy && job?.state === "committed" && job.retained > 0 ? (
            <Pressable
              style={styles.button}
              onPress={() =>
                void run(async () => {
                  await keepMoveOriginals(job);
                  setDone(true);
                })
              }
            >
              <Text style={type.body}>{t("localMove.keep")}</Text>
            </Pressable>
          ) : null}
          {!busy && (!job || done) ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={close}
            >
              <Text style={type.body}>{t("common.close")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
export function LocalMoveRecovery() {
  const { ready } = useSettings();
  const [job, setJob] = useState<MoveSummary | null>(null);
  useEffect(() => {
    if (!ready || Platform.OS !== "android") return;
    let active = true;
    void recoverMoves()
      .then((jobs) => {
        if (active && jobs[0]) setJob(jobs[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready]);
  return job ? (
    <LocalMoveSheet initialJob={job} onClose={() => setJob(null)} />
  ) : null;
}
const styles = createStyles(() => ({
  body: { flex: 1, backgroundColor: colors.void, paddingHorizontal: 20 },
  content: { gap: 14, paddingBottom: 20 },
  card: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.sheet,
  },
  actions: { gap: 8 },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  primary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
  },
}));
