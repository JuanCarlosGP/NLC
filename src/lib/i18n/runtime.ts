import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/locale";
import { translate, type I18nVars } from "@/lib/i18n/t";

let current: AppLocale = DEFAULT_LOCALE;

export function setRuntimeLocale(next: AppLocale): void {
  current = next;
}

export function runtimeLocale(): AppLocale {
  return current;
}

export function dateLocale(): string {
  return current === "es" ? "es" : "en";
}

export function collateLocale(): string {
  return current === "es" ? "es" : "en";
}

export function numberLocale(): string {
  return current === "es" ? "es-ES" : "en";
}

/** Path-based lookup for lib code outside React. */
export function t(path: string, vars?: I18nVars): string {
  return translate(current, path, vars);
}

/** For lib code outside React. English first: default locale is `en`. */
export function tr(en: string, es: string): string {
  return current === "es" ? es : en;
}
