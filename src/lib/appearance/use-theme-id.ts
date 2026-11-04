import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { getNativeAppearance, subscribeNativeAppearance } from "./native-store";
const webSnapshot = () => "classic" as const;
// Each visual component subscribes, including memoized rows. Data providers and
// navigation keep their instances when appearance changes.
export function useThemeId() {
    return useSyncExternalStore(subscribeNativeAppearance, Platform.OS === "web" ? webSnapshot : getNativeAppearance, Platform.OS === "web" ? webSnapshot : getNativeAppearance);
}
