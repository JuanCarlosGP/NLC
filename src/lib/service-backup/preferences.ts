import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getDb } from "@/lib/db/client";
export const preferenceKey = (key: string) => `service_preference:${key}`;
// Native SQLite owns imported preferences in the same transaction as the service data.
// AsyncStorage remains the browser fallback and a migration source for existing installations.
export const servicePreferences = {
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
