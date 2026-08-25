import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppZone = "music" | "podcast" | "video" | "focus" | "wealth";

export const APP_ZONES: { id: AppZone; label: string }[] = [
  { id: "music", label: "Música" },
  { id: "podcast", label: "Podcasts" },
  { id: "video", label: "Vídeo" },
  { id: "focus", label: "Tareas" },
  { id: "wealth", label: "Patrimonio" },
];

export type EnabledZones = Record<AppZone, boolean>;

export const DEFAULT_ENABLED_ZONES: EnabledZones = {
  music: true,
  podcast: true,
  video: true,
  focus: true,
  wealth: true,
};

export function isMediaZone(zone: AppZone): boolean {
  return zone === "music" || zone === "podcast" || zone === "video";
}

const ZONE_KEY = "nlc.app.zone.v1";
const ENABLED_KEY = "nlc.app.zones.enabled.v1";

type ZoneContextValue = {
  zone: AppZone;
  enabled: EnabledZones;
  setZone: (next: AppZone) => boolean;
  setZoneEnabled: (id: AppZone, on: boolean) => void;
};

const ZoneContext = createContext<ZoneContextValue | null>(null);

function parseZone(raw: string | null): AppZone {
  if (raw === "podcast" || raw === "video" || raw === "music" || raw === "focus" || raw === "wealth") return raw;
  return "music";
}

function parseEnabled(raw: string | null): EnabledZones {
  if (!raw) return { ...DEFAULT_ENABLED_ZONES };
  try {
    const parsed = JSON.parse(raw) as Partial<EnabledZones>;
    const next = { ...DEFAULT_ENABLED_ZONES, ...parsed };
    if (!APP_ZONES.some((item) => next[item.id])) return { ...DEFAULT_ENABLED_ZONES };
    return next;
  } catch {
    return { ...DEFAULT_ENABLED_ZONES };
  }
}

function firstEnabled(enabled: EnabledZones, prefer?: AppZone): AppZone {
  if (prefer && enabled[prefer]) return prefer;
  return APP_ZONES.find((item) => enabled[item.id])?.id ?? "music";
}

export function ZoneProvider({ children }: { children: ReactNode }) {
  const [zone, setZoneState] = useState<AppZone>("music");
  const [enabled, setEnabled] = useState<EnabledZones>(DEFAULT_ENABLED_ZONES);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([AsyncStorage.getItem(ZONE_KEY), AsyncStorage.getItem(ENABLED_KEY)]).then(
      ([zoneRaw, enabledRaw]) => {
        if (cancelled) return;
        const nextEnabled = parseEnabled(enabledRaw);
        const nextZone = firstEnabled(nextEnabled, parseZone(zoneRaw));
        setEnabled(nextEnabled);
        setZoneState(nextZone);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setZone = useCallback(
    (next: AppZone) => {
      if (!enabled[next]) return false;
      setZoneState(next);
      void AsyncStorage.setItem(ZONE_KEY, next);
      return true;
    },
    [enabled],
  );

  const setZoneEnabled = useCallback(
    (id: AppZone, on: boolean) => {
      setEnabled((current) => {
        const next = { ...current, [id]: on };
        if (!APP_ZONES.some((item) => next[item.id])) return current;
        void AsyncStorage.setItem(ENABLED_KEY, JSON.stringify(next));
        if (!next[zone]) {
          const fallback = firstEnabled(next);
          setZoneState(fallback);
          void AsyncStorage.setItem(ZONE_KEY, fallback);
        }
        return next;
      });
    },
    [zone],
  );

  const value = useMemo(
    () => ({ zone, enabled, setZone, setZoneEnabled }),
    [enabled, setZone, setZoneEnabled, zone],
  );
  return <ZoneContext.Provider value={value}>{children}</ZoneContext.Provider>;
}

export function useZone(): ZoneContextValue {
  const ctx = useContext(ZoneContext);
  if (!ctx) throw new Error("useZone must be used within ZoneProvider");
  return ctx;
}
