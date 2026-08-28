import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "@/lib/db/client";
import { loadOnboardingComplete } from "@/lib/settings/storage";
import { DEFAULT_LOCALE, parseLocale, type AppLocale } from "@/lib/i18n/locale";

const LOCALE_KEY = "nlc.locale.v1";
const LOCALE_META_KEY = "locale_v1";

async function readSqliteLocale(): Promise<AppLocale | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", LOCALE_META_KEY);
    return parseLocale(row?.value);
  } catch {
    return null;
  }
}

async function writeSqliteLocale(locale: AppLocale): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", LOCALE_META_KEY, locale);
}

export async function loadLocale(): Promise<AppLocale> {
  const fromDb = await readSqliteLocale();
  if (fromDb) return fromDb;
  try {
    const stored = parseLocale(await AsyncStorage.getItem(LOCALE_KEY));
    if (stored) {
      try {
        await writeSqliteLocale(stored);
      } catch {
        // Web memory DB still keeps the in-session copy via getDb.
      }
      return stored;
    }
  } catch {
    // fall through
  }
  // Existing installs were Spanish-only. Fresh wizard defaults to English.
  const onboarded = await loadOnboardingComplete();
  const resolved = onboarded ? "es" : DEFAULT_LOCALE;
  await saveLocale(resolved);
  return resolved;
}

export async function saveLocale(locale: AppLocale): Promise<void> {
  try {
    await writeSqliteLocale(locale);
  } catch {
    // Native SQLite is the source of truth; web falls back to AsyncStorage.
  }
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}
