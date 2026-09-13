import type { Notification } from "expo-notifications";
import { DOWNLOAD_PROGRESS_KIND } from "@/lib/podcasts/download-progress-kind";

export function notificationPresentation(notification: Notification) {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const quiet = data?.kind === DOWNLOAD_PROGRESS_KIND && data?.finished !== true;
  return {
    shouldShowAlert: true,
    shouldShowBanner: !quiet,
    shouldShowList: true,
    shouldPlaySound: !quiet,
    shouldSetBadge: false,
  };
}
