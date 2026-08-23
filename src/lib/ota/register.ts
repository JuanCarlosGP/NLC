import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import type { NasSettings } from "@/lib/settings/storage";
import {
  applyOtaUpdate,
  GITHUB_RELEASES_URL,
  isApkNotification,
  isOtaNotification,
} from "@/lib/ota/apply-update";
import { registerPushTokenOnNas, saveLocalPushToken } from "@/lib/ota/tokens";

const OTA_CHANNEL = "ota";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

export async function registerOtaPush(settings: NasSettings, password: string): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(OTA_CHANNEL, {
    name: "Actualizaciones",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 160, 80, 160],
    lightColor: "#E4D5B8",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return;

  const id = projectId();
  if (!id) return;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    return;
  }
  if (!token) return;

  await saveLocalPushToken(token);
  try {
    await registerPushTokenOnNas(settings, password, token);
  } catch {
    // Retry on next launch if the NAS is offline.
  }
}

function handleNotificationData(data: Record<string, unknown> | undefined) {
  Notifications.clearLastNotificationResponse();
  if (isApkNotification(data)) {
    const url = typeof data?.url === "string" && data.url ? data.url : GITHUB_RELEASES_URL;
    void Linking.openURL(url);
    return;
  }
  if (isOtaNotification(data)) void applyOtaUpdate();
}

export function subscribeOtaNotifications(): () => void {
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    handleNotificationData(event.notification.request.content.data as Record<string, unknown> | undefined);
  });

  void Notifications.getLastNotificationResponseAsync().then((last) => {
    if (!last) return;
    handleNotificationData(last.notification.request.content.data as Record<string, unknown> | undefined);
  });

  return () => response.remove();
}
