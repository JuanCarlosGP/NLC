import { messages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/locale";

export type I18nVars = Record<string, string | number>;

function lookup(locale: AppLocale, path: string): string {
  const from = (tree: unknown): string | null => {
    let cursor: unknown = tree;
    for (const part of path.split(".")) {
      if (!cursor || typeof cursor !== "object" || !(part in cursor)) return null;
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return typeof cursor === "string" ? cursor : null;
  };
  return from(messages[locale]) ?? from(messages.en) ?? path;
}

export function interpolate(template: string, vars?: I18nVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function translate(locale: AppLocale, path: string, vars?: I18nVars): string {
  return interpolate(lookup(locale, path), vars);
}
