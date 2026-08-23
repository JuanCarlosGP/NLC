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
      setFeedback({ text: "Ajustes de descargas guardados.", color: colors.ok });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "No se pudo guardar.",
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
      setFeedback({
        text: health.ok
          ? `Conectado · yt-dlp ${health.ytDlp ?? "?"}${
              health.podcastDir ? ` · ${health.podcastDir}` : health.downloadDir ? ` · ${health.downloadDir}` : ""
            }`
          : "El servicio respondió, pero no está OK.",
        color: health.ok ? colors.ok : colors.danger,
      });
    } catch (err) {
      setFeedback({
        text:
          err instanceof Error
            ? err.message
            : "No hay respuesta. ¿Docker en el NAS y mismo Wi‑Fi?",
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
            throw new Error("La descarga tarda demasiado. Revisa el contenedor.");
          }
          await new Promise((r) => setTimeout(r, 1500));
          current = await getDownloadJob(settings, token, created.id);
          setJob(current);
          const kindHint =
            current.resolvedKind === "podcast"
              ? " · podcast"
              : current.resolvedKind === "song"
                ? " · canción"
                : current.resolvedKind === "video"
                  ? " · vídeo"
                  : "";
          setFeedback({ text: `${jobStatusLabel(current.status)}${kindHint}`, color: colors.inkSoft });
        }

        if (current.status === "done") {
          const where =
            current.resolvedKind === "song"
              ? "Music/Canciones"
              : current.resolvedKind === "podcast"
                ? "Music/Podcasts"
                : current.resolvedKind === "video"
                  ? "Popcorn/movies"
                  : "el NAS";
          setFeedback({
            text: current.filename
              ? `Guardado en ${where}: ${current.filename}. Refresca la biblioteca.`
              : `Descarga lista en ${where}. Refresca la biblioteca.`,
            color: colors.ok,
          });
        } else {
          setFeedback({
            text: current.error || "La descarga falló.",
            color: colors.danger,
          });
        }
        return current;
      } catch (err) {
        setFeedback({
          text: err instanceof Error ? err.message : "No se pudo encolar.",
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
