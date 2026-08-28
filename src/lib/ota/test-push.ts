import { Platform } from "react-native";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { t } from "@/lib/i18n/runtime";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const OTA_CHANNEL = "ota";

export type TestPushResult = {
  ok: boolean;
  message: string;
};

function projectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

export async function sendTestPush(): Promise<TestPushResult> {
  if (Platform.OS !== "android") {
    return { ok: false, message: t("push.apkOnly") };
  }
  if (isRunningInExpoGo()) {
    return { ok: false, message: t("push.expoGo") };
  }

  const Notifications = await import("expo-notifications");

  await Notifications.setNotificationChannelAsync(OTA_CHANNEL, {
    name: t("push.channel"),
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
  if (status !== "granted") {
    return { ok: false, message: t("push.noPermission") };
  }

  const id = projectId();
  if (!id) {
    return { ok: false, message: t("push.noEas") };
  }

  let token: string | null = null;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    token = null;
  }

  if (!token) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "NLC",
        body: t("push.localBody"),
        sound: "default",
        data: { test: true },
      },
      trigger: null,
    });
    return {
      ok: false,
      message: t("push.localNotice"),
    };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title: "NLC",
        body: t("push.testBody"),
        sound: "default",
        channelId: OTA_CHANNEL,
        data: { test: true },
      }),
    });
    const payload = (await response.json()) as {
      data?: { status?: string } | { status?: string }[];
    };
    if (!response.ok) {
      return { ok: false, message: t("push.expoFail") };
    }
    const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (ticket && ticket.status === "error") {
      return { ok: false, message: t("push.tokenRejected") };
    }
    return { ok: true, message: t("push.sent") };
  } catch {
    return { ok: false, message: t("push.noNetwork") };
  }
}
