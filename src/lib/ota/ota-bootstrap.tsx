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
