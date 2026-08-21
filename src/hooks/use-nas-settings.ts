import { useEffect, useState } from "react";
import { writeShareConfig } from "@/lib/nas/share-config";
import { createMusicSource } from "@/lib/nas/source-factory";
import { probeWebDav } from "@/lib/nas/webdav-source";
import { colors } from "@/lib/theme";
import { useSettings } from "@/lib/settings/settings-context";

export type SettingsFeedback = {
  text: string;
  color: string;
};

/** Survives Settings screen remounts so the APK doesn't flash disabled→enabled. */
let cachedShareConnected = false;

export function useNasSettings() {
  const ctx = useSettings();
  const { settings, password } = ctx;
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(cachedShareConnected);

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
    settings.sourceKind,
    settings.useHttps,
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

  async function saveShareConfig() {
    if (ctx.settings.sourceKind !== "webdav") return;
    setBusy(true);
    try {
      const path = await writeShareConfig(ctx.settings, ctx.password);
      setFeedback({
        text: `Configuración guardada en ${path}.`,
        color: colors.ok,
      });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "No se pudo guardar la configuración en la carpeta.",
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }

  return { ...ctx, feedback, busy, connected, testConnection, save, saveShareConfig };
}
