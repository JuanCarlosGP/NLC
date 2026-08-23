import { useEffect, useState } from "react";
import { clearLocalLibrary } from "@/lib/db/catalog";
import { createMusicSource } from "@/lib/nas/source-factory";
import { probeWebDav } from "@/lib/nas/webdav-source";
import type { NasSettings } from "@/lib/settings/storage";
import { podcastSourceSettings, videoSourceSettings } from "@/lib/settings/storage";
import { useSettings } from "@/lib/settings/settings-context";
import { createVideoDavClient } from "@/lib/video/dav";
import { listLocalVideoShows, forgetLocalVideoTree } from "@/lib/local/local-video";
import { createLocalSource } from "@/lib/local/local-source";
import { colors } from "@/lib/theme";

export type SettingsFeedback = {
  text: string;
  color: string;
};

/** Survives Settings screen remounts so the APK doesn't flash disabled→enabled. */
let cachedShareConnected = false;
let cachedVideoConnected = false;

export function useNasSettings() {
  const ctx = useSettings();
  const { settings, password } = ctx;
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(cachedShareConnected);
  const [videoConnected, setVideoConnected] = useState(cachedVideoConnected);

  useEffect(() => {
    if (settings.sourceKind !== "webdav") {
      cachedShareConnected = false;
      setConnected(false);
      return;
    }

    let cancelled = false;
    void probeWebDav(settings, password).then((ok) => {
      if (cancelled) return;
      cachedShareConnected = ok;
      setConnected(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [
    password,
    settings.host,
    settings.port,
    settings.sharePath,
    settings.podcastSharePath,
    settings.sourceKind,
    settings.useHttps,
    settings.username,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const conn = videoSourceSettings(settings);
        if (!conn.host.trim() || !conn.username.trim() || !conn.sharePath.trim() || !password) {
          cachedVideoConnected = false;
          if (!cancelled) setVideoConnected(false);
          return;
        }
        const { listDir } = createVideoDavClient(settings, password);
        await listDir(conn.sharePath);
        cachedVideoConnected = true;
        if (!cancelled) setVideoConnected(true);
      } catch {
        cachedVideoConnected = false;
        if (!cancelled) setVideoConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    password,
    settings.videoHost,
    settings.videoPort,
    settings.videoSharePath,
    settings.videoUseHttps,
    settings.videoUsername,
    settings.host,
    settings.port,
    settings.username,
  ]);

  async function testConnection() {
    setBusy(true);
    setFeedback(null);
    try {
      const source = createMusicSource(ctx.settings, ctx.password);
      const ping = await source.ping();
      cachedShareConnected = ping.ok;
      setConnected(ping.ok);
      setFeedback({
        text: ping.message,
        color: ping.ok ? colors.ok : colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      await ctx.persist();
      if (ctx.settings.sourceKind === "mock") {
        cachedShareConnected = false;
        setConnected(false);
        setFeedback({
          text: "Ajustes guardados. Estás usando la biblioteca de ejemplo.",
          color: colors.ok,
        });
        return;
      }
      const source = createMusicSource(ctx.settings, ctx.password);
      const ping = await source.ping();
      cachedShareConnected = ping.ok;
      setConnected(ping.ok);
      setFeedback(
        ping.ok
          ? { text: `Ajustes guardados. ${ping.message}`, color: colors.ok }
          : {
              text: `Ajustes guardados, pero no hay conexión. ${ping.message}`,
              color: colors.warn,
            },
      );
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "No se pudieron guardar los ajustes.",
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  async function testPodcastConnection() {
    setBusy(true);
    setFeedback(null);
    try {
      const conn = podcastSourceSettings(ctx.settings);
      if (!conn.sharePath.trim()) {
        throw new Error("Falta la ruta absoluta de los podcasts.");
      }
      const ok = await probeWebDav(conn, ctx.password);
      cachedShareConnected = ok;
      setConnected(ok);
      if (!ok) throw new Error(`No se pudo abrir ${conn.sharePath}.`);
      setFeedback({
        text: `Hay conexión con ${conn.sharePath}.`,
        color: colors.ok,
      });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "No se pudo conectar a la carpeta de podcasts.",
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  async function testVideoConnection() {
    setBusy(true);
    setFeedback(null);
    try {
      const conn = videoSourceSettings(ctx.settings);
      if (!conn.sharePath.trim()) {
        throw new Error("Falta la ruta absoluta de la carpeta de vídeo.");
      }
      const { listDir } = createVideoDavClient(ctx.settings, ctx.password);
      const entries = await listDir(conn.sharePath);
      cachedVideoConnected = true;
      setVideoConnected(true);
      setFeedback({
        text: `Hay conexión. ${entries.length} elementos en ${conn.sharePath}.`,
        color: colors.ok,
      });
    } catch (error) {
      cachedVideoConnected = false;
      setVideoConnected(false);
      setFeedback({
        text: error instanceof Error ? error.message : "No se pudo conectar a la carpeta de vídeo.",
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  async function applyLocalFolder(next: NasSettings) {
    setBusy(true);
    setFeedback(null);
    try {
      const musicChanged = next.localFolderUri !== ctx.settings.localFolderUri;
      const podcastChanged = next.podcastLocalFolderUri !== ctx.settings.podcastLocalFolderUri;
      const videoChanged = next.videoLocalFolderUri !== ctx.settings.videoLocalFolderUri;
      await ctx.persist(next);

      if (videoChanged && !musicChanged && !podcastChanged) {
        forgetLocalVideoTree();
        if (!next.videoLocalFolderUri) {
          setFeedback({ text: "Carpeta local de vídeo quitada.", color: colors.ok });
          return;
        }
        const shows = await listLocalVideoShows(next.videoLocalFolderUri);
        setFeedback({
          text: shows.length
            ? `${shows.length} título${shows.length === 1 ? "" : "s"} en la carpeta local de vídeo.`
            : "La carpeta local de vídeo está vacía o no tiene series/movies.",
          color: shows.length ? colors.ok : colors.warn,
        });
        return;
      }

      if (podcastChanged && !musicChanged) {
        if (!next.podcastLocalFolderUri) {
          await clearLocalLibrary("localpod:");
          setFeedback({ text: "Carpeta local de podcasts quitada.", color: colors.ok });
          return;
        }
        const source = createLocalSource(next.podcastLocalFolderUri, { asPodcast: true, idPrefix: "localpod" });
        const ping = await source.ping();
        setFeedback({ text: ping.message, color: ping.ok ? colors.ok : colors.warn });
        return;
      }

      if (!next.localFolderUri) {
        await clearLocalLibrary("local:");
        setFeedback({ text: "Carpeta local de música quitada.", color: colors.ok });
        return;
      }
      const source = createMusicSource(next, ctx.password);
      const ping = await source.ping();
      setFeedback({
        text: ping.message,
        color: ping.ok ? colors.ok : colors.warn,
      });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "No se pudo usar la carpeta local.",
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    ...ctx,
    feedback,
    busy,
    connected,
    testConnection,
    save,
    applyLocalFolder,
    testPodcastConnection,
    testVideoConnection,
    videoConnected,
  };
}
