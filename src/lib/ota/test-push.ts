import { Platform } from "react-native";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";

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
    return { ok: false, message: "El push solo se prueba en la APK del teléfono" };
  }
  if (isRunningInExpoGo()) {
    return { ok: false, message: "El push no funciona en Expo Go. Pruébalo en la APK." };
  }

  const Notifications = await import("expo-notifications");

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
  if (status !== "granted") {
    return { ok: false, message: "Sin permiso de notificaciones. Actívalo en Ajustes del sistema." };
  }

  const id = projectId();
  if (!id) {
    return { ok: false, message: "Esta instalación no tiene proyecto EAS. Usa la APK de GitHub." };
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
        body: "Aviso local. El push remoto no está listo (falta FCM en EAS).",
        sound: "default",
        data: { test: true },
      },
      trigger: null,
    });
    return {
      ok: false,
      message: "Salió un aviso local. El push de verdad necesita FCM en Expo.",
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
        body: "Prueba de push. Si ves esto, las notificaciones llegan.",
        sound: "default",
        channelId: OTA_CHANNEL,
        data: { test: true },
      }),
    });
    const payload = (await response.json()) as {
      data?: { status?: string } | { status?: string }[];
    };
    if (!response.ok) {
      return { ok: false, message: "Expo no pudo enviar el push. Prueba otra vez." };
    }
    const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (ticket && ticket.status === "error") {
      return { ok: false, message: "Expo rechazó el token. Reinstala la APK." };
    }
    return { ok: true, message: "Push enviada. Mira la barra de notificaciones." };
  } catch {
    return { ok: false, message: "Sin red. No se pudo enviar la prueba." };
  }
}
