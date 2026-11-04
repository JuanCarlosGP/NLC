import { Platform } from "react-native";

// Explicit opt-in for a localhost web session; never enabled in an APK or release.
export const localDemoEnabled = __DEV__ && Platform.OS === "web" && process.env.EXPO_PUBLIC_NLC_DEMO === "1";

export function requireLocalDemo() {
  if (!localDemoEnabled) throw new Error("Local demo is disabled");
}
