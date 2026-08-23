import { Platform } from "react-native";

/** RN Animated: native driver is unavailable on web (falls back with a console warning). */
export const USE_NATIVE_DRIVER = Platform.OS !== "web";
