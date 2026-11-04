import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppearanceContext } from "./shared";
import { APPEARANCE_KEY, parseAppearance, type AppearanceId } from "./themes";
import { appearanceCss } from "./css";

function apply(theme: AppearanceId) { document.documentElement.dataset.nlcTheme = theme; }
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setState] = useState<AppearanceId>("classic");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const saved = useRef<AppearanceId>("classic");
  const revision = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  useLayoutEffect(() => {
    if (!document.getElementById("nlc-appearance")) {
      const style = document.createElement("style"); style.id = "nlc-appearance"; style.textContent = appearanceCss; document.head.appendChild(style);
    }
    let initial: AppearanceId = "classic";
    try { initial = parseAppearance(localStorage.getItem(APPEARANCE_KEY)); } catch { /* Storage can be unavailable in private contexts. */ }
    saved.current = initial; apply(initial); setState(initial); setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY && event.key !== null) return;
      const next = parseAppearance(event.newValue); saved.current = next; apply(next); setState(next); setError(false);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setTheme = useCallback(async (next: AppearanceId) => {
    const version = ++revision.current;
    apply(next); setState(next); setError(false);
    const task = writes.current.then(async () => { await AsyncStorage.setItem(APPEARANCE_KEY, next); saved.current = next; });
    writes.current = task.catch(() => {});
    try { await task; } catch {
      if (revision.current === version) { apply(saved.current); setState(saved.current); setError(true); }
    }
  }, []);
  const value = useMemo(() => ({ theme, ready, error, setTheme }), [theme, ready, error, setTheme]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
