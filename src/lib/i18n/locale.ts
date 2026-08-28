export type AppLocale = "en" | "es";

export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALES: { id: AppLocale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

export function parseLocale(raw: string | null | undefined): AppLocale | null {
  if (raw === "en" || raw === "es") return raw;
  return null;
}
