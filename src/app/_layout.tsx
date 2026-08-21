import { type ReactNode, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Dock } from "@/components/layout/dock";
import { MiniPlayer } from "@/components/layout/mini-player";
import { NowPlayingSheet } from "@/components/player/now-playing-sheet";
import { ImportedPlaylistSheet } from "@/components/library/imported-playlist-sheet";
import { DockProvider } from "@/lib/dock-context";
import { FavoritesProvider } from "@/lib/favorites/favorites-context";
import { PlayerProvider } from "@/lib/player/player-context";
import { PlayerUiProvider } from "@/lib/player/player-ui-context";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { ImportedSheetProvider } from "@/lib/spotify/imported-sheet-context";
import { SpotifyProvider } from "@/lib/spotify/spotify-context";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const fonts = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  InstrumentSerif_400Regular,
};

export default function RootLayout() {
  const [loaded] = useFonts(fonts);
  const [timedOut, setTimedOut] = useState(false);
  const ready = loaded || timedOut;

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.void }} />;
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SpotifyProvider>
          <ImportedSheetProvider>
          <FavoritesProvider>
            <PlayerProvider>
              <PlayerUiProvider>
                <DockChrome>
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.void }}>
                    <StatusBar style="light" />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: {
                          backgroundColor: colors.void,
                          ...(Platform.OS === "web" ? { flex: 1 } : null),
                        },
                      }}
                    >
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="album/[id]" />
                      <Stack.Screen name="artist/[id]" />
                      <Stack.Screen name="imported/[id]" />
                      <Stack.Screen name="favorites" />
                      <Stack.Screen name="now-playing" />
                      <Stack.Screen name="queue" />
                    </Stack>
                    <MiniPlayer />
                    <Dock />
                    <NowPlayingSheet />
                    <ImportedPlaylistSheet />
                  </GestureHandlerRootView>
                </DockChrome>
              </PlayerUiProvider>
          </PlayerProvider>
          </FavoritesProvider>
          </ImportedSheetProvider>
        </SpotifyProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function DockChrome({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <DockProvider enabled bottomInset={insets.bottom}>
      {children}
    </DockProvider>
  );
}
