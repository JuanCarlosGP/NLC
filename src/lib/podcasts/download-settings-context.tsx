import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { colors } from "@/lib/theme";
import { t } from "@/lib/i18n/runtime";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  loadDownloadSettings,
  loadDownloadToken,
  saveDownloadSettings,
  saveDownloadToken,
  type DownloadSettings,
} from "@/lib/podcasts/download-settings";
import {
  checkDownloaderHealth,
  enqueueDownload,
  getDownloadJob,
  jobStatusLabel,
  type DownloadJob,
  type DownloadMediaKind,
} from "@/lib/podcasts/downloader";

export type DownloadFeedback = {
  text: string;
  color: string;
};

type DownloadSettingsContextValue = {
  ready: boolean;
  settings: DownloadSettings;
  setSettings: (next: DownloadSettings) => void;
  token: string;
  setToken: (next: string) => void;
  busy: boolean;
  feedback: DownloadFeedback | null;
  job: DownloadJob | null;
  persist: () => Promise<void>;
  testConnection: () => Promise<void>;
  enqueue: (url: string, kind?: DownloadMediaKind) => Promise<DownloadJob>;
};

const DownloadSettingsContext = createContext<DownloadSettingsContextValue | null>(null);

export function DownloadSettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<DownloadFeedback | null>(null);
  const [job, setJob] = useState<DownloadJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, storedToken] = await Promise.all([loadDownloadSettings(), loadDownloadToken()]);
      if (cancelled) return;
      setSettings(stored);
      setToken(storedToken);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await Promise.all([saveDownloadSettings(settings), saveDownloadToken(token)]);
      setFeedback({ text: t("feedback.downloadsSaved"), color: colors.ok });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : t("feedback.saveShortFail"),
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }, [settings, token]);

  const testConnection = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const health = await checkDownloaderHealth(settings, token);
      const dirs = health.podcastDir ?? health.downloadDir;
      setFeedback({
        text: health.ok
          ? t("downloadSheet.healthConnected", {
              version: health.ytDlp ?? "?",
              dirs: dirs ? ` · ${dirs}` : "",
            })
          : t("feedback.downloaderNotOk"),
        color: health.ok ? colors.ok : colors.danger,
      });
    } catch (err) {
      setFeedback({
        text:
          err instanceof Error
            ? err.message
            : t("feedback.downloaderNoReply"),
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }, [settings, token]);

  const enqueue = useCallback(
    async (url: string, kind: DownloadMediaKind = "song") => {
      setBusy(true);
      setFeedback(null);
      try {
        const created = await enqueueDownload(settings, token, url, kind);
        let current = await getDownloadJob(settings, token, created.id);
        setJob(current);
        setFeedback({ text: jobStatusLabel(current.status), color: colors.inkSoft });

        const started = Date.now();
        while (current.status === "queued" || current.status === "running") {
          if (Date.now() - started > 15 * 60 * 1000) {
            throw new Error(t("feedback.downloadSlow"));
          }
          await new Promise((r) => setTimeout(r, 1500));
          current = await getDownloadJob(settings, token, created.id);
          setJob(current);
          const kindHint =
            current.resolvedKind === "podcast"
              ? t("downloadSheet.kindHintPodcast")
              : current.resolvedKind === "song"
                ? t("downloadSheet.kindHintSong")
                : current.resolvedKind === "video"
                  ? t("downloadSheet.kindHintVideo")
                  : "";
          setFeedback({ text: `${jobStatusLabel(current.status)}${kindHint}`, color: colors.inkSoft });
        }

        if (current.status === "done") {
          const where =
            current.resolvedKind === "song"
              ? t("downloadSheet.songHint")
              : current.resolvedKind === "podcast"
                ? t("downloadSheet.podcastHint")
                : current.resolvedKind === "video"
                  ? t("downloadSheet.videoHint")
                  : t("downloadSheet.nasFallback");
          setFeedback({
            text: current.filename
              ? t("downloadSheet.savedTo", { where, filename: current.filename })
              : t("downloadSheet.savedReady", { where }),
            color: colors.ok,
          });
        } else {
          setFeedback({
            text: current.error || t("feedback.downloadFail"),
            color: colors.danger,
          });
        }
        return current;
      } catch (err) {
        setFeedback({
          text: err instanceof Error ? err.message : t("feedback.enqueueFail"),
          color: colors.danger,
        });
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [settings, token],
  );

  const value = useMemo(
    () => ({
      ready,
      settings,
      setSettings,
      token,
      setToken,
      busy,
      feedback,
      job,
      persist,
      testConnection,
      enqueue,
    }),
    [ready, settings, token, busy, feedback, job, persist, testConnection, enqueue],
  );

  return <DownloadSettingsContext.Provider value={value}>{children}</DownloadSettingsContext.Provider>;
}

export function useDownloadSettings(): DownloadSettingsContextValue {
  const ctx = useContext(DownloadSettingsContext);
  if (!ctx) throw new Error("useDownloadSettings must be used within DownloadSettingsProvider");
  return ctx;
}
