import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getDb } from "@/lib/db/client";
export const preferenceKey = (key: string) => `service_preference:${key}`;
// Native SQLite owns imported preferences in the same transaction as the service data.
// AsyncStorage remains the browser fallback and a migration source for existing installations.
const localPreferences = {
  async getItem(key: string) {
    if (Platform.OS !== "web") {
      const row = await (
        await getDb()
      ).getFirstAsync<{ value: string }>(
        "SELECT value FROM meta WHERE key = ?",
        preferenceKey(key),
      );
      if (row) return row.value;
    }
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS !== "web") {
      await (
        await getDb()
      ).runAsync(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        preferenceKey(key),
        value,
      );
      void AsyncStorage.setItem(key, value).catch(() => {});
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS !== "web")
      await (
        await getDb()
      ).runAsync("DELETE FROM meta WHERE key = ?", preferenceKey(key));
    await AsyncStorage.removeItem(key);
  },
};

import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
export const servicePreferences = remoteEnabled ? {
 getItem: (key: string) => browserBackend.invoke<string | null>("preferences.get", [key], { domain: "preferences" }),
 setItem: (key: string, value: string) => browserBackend.invoke<void>("preferences.set", [key, value], { domain: "preferences", write: true, key: args => args[0] }),
 removeItem: (key: string) => browserBackend.invoke<void>("preferences.remove", [key], { domain: "preferences", write: true, key: args => args[0] }),
} : localPreferences;
