import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppZone = "music" | "podcast" | "video" | "focus";

const ZONE_KEY = "snd.app.zone.v1";

type ZoneContextValue = {
  zone: AppZone;
  setZone: (next: AppZone) => void;
};

const ZoneContext = createContext<ZoneContextValue | null>(null);

function parseZone(raw: string | null): AppZone {
  if (raw === "podcast" || raw === "video" || raw === "music" || raw === "focus") return raw;
  return "music";
}

export function ZoneProvider({ children }: { children: ReactNode }) {
  const [zone, setZoneState] = useState<AppZone>("music");

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(ZONE_KEY).then((raw) => {
      if (!cancelled) setZoneState(parseZone(raw));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setZone = useCallback((next: AppZone) => {
    setZoneState(next);
    void AsyncStorage.setItem(ZONE_KEY, next);
  }, []);

  const value = useMemo(() => ({ zone, setZone }), [zone, setZone]);
  return <ZoneContext.Provider value={value}>{children}</ZoneContext.Provider>;
}

export function useZone(): ZoneContextValue {
  const ctx = useContext(ZoneContext);
  if (!ctx) throw new Error("useZone must be used within ZoneProvider");
  return ctx;
}
