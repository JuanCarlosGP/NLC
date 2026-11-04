import { createContext, useContext } from "react";
import type { AppearanceId } from "./themes";
export type AppearanceValue = { theme: AppearanceId; ready: boolean; error: boolean; setTheme: (theme: AppearanceId) => Promise<void> };
export const AppearanceContext = createContext<AppearanceValue | null>(null);
export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used within AppearanceProvider");
  return value;
}
