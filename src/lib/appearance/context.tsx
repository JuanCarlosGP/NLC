import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { AppearanceContext } from "./shared";
import { createAppearancePreference } from "./preference";
import { setNativeAppearance } from "./native-store";
import { classicPalette, pixelPalette } from "./themes";
export function AppearanceProvider({ children }: {
    children: ReactNode;
}) {
    const [preference] = useState(() => createAppearancePreference(AsyncStorage, setNativeAppearance));
    const state = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot);
    useEffect(() => { void preference.load(); }, [preference]);
    const background = state.theme === "geist-pixel" ? pixelPalette.void : classicPalette.void;
    useEffect(() => { void SystemUI.setBackgroundColorAsync(background).catch(() => { }); }, [background]);
    const value = useMemo(() => ({ ...state, setTheme: preference.select }), [state, preference]);
    return <AppearanceContext.Provider value={value}>{state.ready ? children : <View style={{ flex: 1, backgroundColor: background }}/>}</AppearanceContext.Provider>;
}
