import { useEffect } from "react";
import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useSettings } from "@/lib/settings/settings-context";

export function OtaBootstrap() {
  const { ready, settings, password } = useSettings();

  useEffect(() => {
    if (Platform.OS === "web" || isRunningInExpoGo()) return;
    let unsub = () => {};
    let cancelled = false;
    void import("@/lib/ota/register").then((mod) => {
      if (cancelled) return;
      unsub = mod.subscribeOtaNotifications();
    });
    // APK JS checks updates only from Settings or a notification tap.
    // Settings currently crashes on the shipped APK, so apply here on launch.
    void import("@/lib/ota/apply-update").then((mod) => {
      if (!cancelled) void mod.applyOtaUpdate();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS === "web" || isRunningInExpoGo()) return;
    void import("@/lib/ota/register").then((mod) => {
      void mod.registerOtaPush(settings, password);
    });
  }, [password, ready, settings]);

  return null;
}
