import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createMusicSource } from "@/lib/nas/source-factory";
import type { MusicSource } from "@/lib/nas/types";
import { mockSource } from "@/lib/nas/mock-source";
import {
  UNSET_NAS_SETTINGS,
  clearOnboardingComplete,
  isClearlyConfiguredNas,
  loadNasPassword,
  loadNasSettings,
  loadOnboardingComplete,
  looksLikeFactoryNas,
  saveNasPassword,
  saveNasSettings,
  saveOnboardingComplete,
  type NasSettings,
} from "@/lib/settings/storage";

type SettingsContextValue = {
  ready: boolean;
  settings: NasSettings;
  password: string;
  source: MusicSource;
  onboardingNeeded: boolean;
  setSettings: (next: NasSettings) => void;
  setPassword: (next: string) => void;
  persist: (next?: NasSettings, nextPassword?: string) => Promise<void>;
  reloadSource: () => void;
  skipOnboarding: () => Promise<void>;
  completeOnboarding: (next: NasSettings, nextPassword: string) => Promise<void>;
  replayOnboarding: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<NasSettings>(UNSET_NAS_SETTINGS);
  const [password, setPassword] = useState("");
  const [sourceKey, setSourceKey] = useState(0);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [stored, storedPassword, onboardingDone] = await Promise.all([
          loadNasSettings(),
          loadNasPassword(),
          loadOnboardingComplete(),
        ]);
        if (cancelled) return;
        setSettings(stored);
        setPassword(storedPassword);
        if (onboardingDone) {
          setOnboardingNeeded(false);
        } else if (isClearlyConfiguredNas(stored, storedPassword)) {
          try {
            await saveOnboardingComplete();
          } catch {
            // Flag is best-effort; existing NAS still skips the wizard this session.
          }
          if (!cancelled) setOnboardingNeeded(false);
        } else {
          setOnboardingNeeded(true);
        }
      } catch (error) {
        console.warn("No se pudieron cargar los ajustes", error);
        if (!cancelled) setOnboardingNeeded(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const source = useMemo(
    () => (ready ? createMusicSource(settings, password) : mockSource),
    [ready, settings, password, sourceKey],
  );

  const persist = useCallback(
    async (next?: NasSettings, nextPassword?: string) => {
      const resolvedSettings = next ?? settings;
      const resolvedPassword = nextPassword !== undefined ? nextPassword : password;
      if (next) setSettings(next);
      if (nextPassword !== undefined) setPassword(nextPassword);
      await Promise.all([saveNasSettings(resolvedSettings), saveNasPassword(resolvedPassword)]);
      setSourceKey((value) => value + 1);
    },
    [settings, password],
  );

  const reloadSource = useCallback(() => {
    setSourceKey((value) => value + 1);
  }, []);

  const skipOnboarding = useCallback(async () => {
    try {
      if (!password.trim() && looksLikeFactoryNas(settings)) {
        setSettings(UNSET_NAS_SETTINGS);
        setPassword("");
        await Promise.all([saveNasSettings(UNSET_NAS_SETTINGS), saveNasPassword("")]);
      }
      await saveOnboardingComplete();
    } catch (error) {
      console.warn("No se pudo guardar el onboarding", error);
    } finally {
      setOnboardingNeeded(false);
    }
  }, [password, settings]);

  const completeOnboarding = useCallback(
    async (next: NasSettings, nextPassword: string) => {
      try {
        await persist(next, nextPassword);
        reloadSource();
        await saveOnboardingComplete();
      } finally {
        setOnboardingNeeded(false);
      }
    },
    [persist, reloadSource],
  );

  const replayOnboarding = useCallback(async () => {
    await clearOnboardingComplete();
    setOnboardingNeeded(true);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      settings,
      password,
      source,
      onboardingNeeded,
      setSettings,
      setPassword,
      persist,
      reloadSource,
      skipOnboarding,
      completeOnboarding,
      replayOnboarding,
    }),
    [
      ready,
      settings,
      password,
      source,
      onboardingNeeded,
      persist,
      reloadSource,
      skipOnboarding,
      completeOnboarding,
      replayOnboarding,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
