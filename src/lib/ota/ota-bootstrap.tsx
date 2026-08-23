import { useEffect } from "react";
import { Platform } from "react-native";
import { useSettings } from "@/lib/settings/settings-context";
import { registerOtaPush, subscribeOtaNotifications } from "@/lib/ota/register";

export function OtaBootstrap() {
  const { ready, settings, password } = useSettings();

  useEffect(() => {
    if (Platform.OS === "web") return;
    return subscribeOtaNotifications();
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS === "web") return;
    void registerOtaPush(settings, password);
  }, [password, ready, settings]);

  return null;
}
