import { pushPlaylistsToSources } from "@/lib/spotify/playlist-sync.impl";
import { syncAllReminderNotifications } from "@/lib/reminders/notifications";
import { listReminders } from "@/lib/reminders/store.impl";
import { syncMedicationAlerts } from "@/lib/health/medication/notifications";
import { medicationStore } from "@/lib/health/medication/storage.impl";
import { syncRestAlert } from "@/lib/health/training/notifications";
import { trainingStore } from "@/lib/health/training/storage.impl";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { pushFocusToSources } from "@/lib/productivity/sync.impl";
import { pushWealthToSources } from "@/lib/wealth/sync.impl";
import { setAfterMutation } from "./native";
setAfterMutation(async domain => {
 if (domain === "reminders") await syncAllReminderNotifications(await listReminders());
 if (domain === "medication") await syncMedicationAlerts(await medicationStore.read());
 if (domain === "training") await syncRestAlert(await trainingStore.getRest());
 if (domain === "playlists") await pushPlaylistsToSources(await loadNasSettings(), await loadNasPassword());
 if (["tasks", "wealth", "reminders"].includes(domain)) {
  const settings = await loadNasSettings(), password = await loadNasPassword();
  if (domain === "wealth") await pushWealthToSources(settings, password); else await pushFocusToSources(settings, password);
 }
});
