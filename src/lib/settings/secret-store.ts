import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

function useAsync(): boolean {
  return Platform.OS === "web";
}

export async function getSecret(key: string): Promise<string | null> {
  if (remoteEnabled) return null;
  try {
    if (useAsync()) return await AsyncStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (remoteEnabled) { if (value.trim()) await browserBackend.invoke("credentials.set", [key, value], { domain: "credentials", write: true, atomic: false, key: args => args[0] }); return; }
  if (!value) {
    await deleteSecret(key);
    return;
  }
  if (useAsync()) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (remoteEnabled) { await browserBackend.invoke("credentials.clear", [key], { domain: "credentials", write: true, atomic: false, key: args => args[0] }); return; }
  try {
    if (useAsync()) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Native SecureStore is missing on web; ignore leftover keys.
  }
}
