import { useEffect } from "react";
import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useDownloadSettings } from "@/lib/podcasts/download-settings-context";
import { resumeNasDownloadWatch } from "@/lib/podcasts/download-progress";

export function DownloadProgressHost() {
  const { ready, settings, token } = useDownloadSettings();

  useEffect(() => {
    if (!ready || Platform.OS === "web" || isRunningInExpoGo()) return;
    void resumeNasDownloadWatch(settings, token);
  }, [ready, settings, token]);

  return null;
}
