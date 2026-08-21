import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createMusicSource } from "@/lib/nas/source-factory";
import type { MusicSource } from "@/lib/nas/types";
import { mockSource } from "@/lib/nas/mock-source";
import {
  DEFAULT_NAS_SETTINGS,
  loadNasPassword,
  loadNasSettings,
  saveNasPassword,
  saveNasSettings,
  type NasSettings,
} from "@/lib/settings/storage";

type SettingsContextValue = {
  ready: boolean;
  settings: NasSettings;
  password: string;
  source: MusicSource;
  setSettings: (next: NasSettings) => void;
  setPassword: (next: string) => void;
  persist: () => Promise<void>;
  reloadSource: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<NasSettings>(DEFAULT_NAS_SETTINGS);
  const [password, setPassword] = useState("");
  const [sourceKey, setSourceKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, storedPassword] = await Promise.all([loadNasSettings(), loadNasPassword()]);
      if (cancelled) return;
      setSettings(stored);
      setPassword(storedPassword);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const source = useMemo(
    () => (ready ? createMusicSource(settings, password) : mockSource),
    [ready, settings, password, sourceKey],
  );

  const persist = useCallback(async () => {
    await Promise.all([saveNasSettings(settings), saveNasPassword(password)]);
    setSourceKey((value) => value + 1);
  }, [settings, password]);

  const reloadSource = useCallback(() => {
    setSourceKey((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      settings,
      password,
      source,
      setSettings,
      setPassword,
      persist,
      reloadSource,
    }),
    [ready, settings, password, source, persist, reloadSource],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
