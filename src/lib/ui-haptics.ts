import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const MIN_HAPTIC_GAP_MS = 45;
let lastHapticAt = 0;

function runHaptic(task: () => Promise<unknown>): void {
  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_GAP_MS) return;
  lastHapticAt = now;
  void task().catch(() => {});
}

export function triggerUiHaptic(): void {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") {
    runHaptic(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click));
    return;
  }
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function triggerSelectionUiHaptic(): void {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") {
    runHaptic(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key));
    return;
  }
  runHaptic(() => Haptics.selectionAsync());
}
