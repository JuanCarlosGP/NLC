import { type ReactNode, useEffect, useState } from "react";
import { LogBox, Platform, StyleSheet, View } from "react-native";
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
import { ChatSheet } from "@/components/chat/chat-sheet";
import { Dock } from "@/components/layout/dock";
import { MiniPlayer } from "@/components/layout/mini-player";
import { NowPlayingSheet } from "@/components/player/now-playing-sheet";
import { PlaylistActionsSheet } from "@/components/library/playlist-actions-sheet";
import { TrackActionsSheet } from "@/components/player/track-actions-sheet";
import { VideoActionsSheet } from "@/components/video/video-actions-sheet";
import { DockProvider } from "@/lib/dock-context";
import { FavoritesProvider } from "@/lib/favorites/favorites-context";
import { CursorProvider } from "@/lib/cursor/cursor-context";
import { DownloadSettingsProvider } from "@/lib/podcasts/download-settings-context";
import { PlayerProvider } from "@/lib/player/player-context";
import { PlayerUiProvider } from "@/lib/player/player-ui-context";
import { TrackActionsProvider } from "@/lib/player/track-actions-context";
import { VideoActionsProvider } from "@/lib/video/video-actions-context";
import { OfflineProvider } from "@/lib/offline/offline-context";
import { SettingsProvider, useSettings } from "@/lib/settings/settings-context";
import { LocaleProvider, useI18n } from "@/lib/i18n/context";
import { ProductivityProvider } from "@/lib/productivity/productivity-context";
import { RemindersProvider } from "@/lib/reminders/reminders-context";
import { WealthProvider } from "@/lib/wealth/wealth-context";
import { TxActionsProvider } from "@/lib/wealth/tx-actions-context";
import { TaskActionsProvider } from "@/lib/productivity/task-actions-context";
import { ZoneProvider } from "@/lib/zone/zone-context";
import { TaskActionsSheet } from "@/components/productivity/task-actions-sheet";
import { TxActionsSheet } from "@/components/wealth/tx-composer-sheet";
import { PlaylistActionsProvider } from "@/lib/spotify/playlist-actions-context";
import { SpotifyProvider } from "@/lib/spotify/spotify-context";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Onboarding } from "@/components/onboarding/onboarding";
import { OtaBootstrap } from "@/lib/ota/ota-bootstrap";
import { colors } from "@/lib/theme";

LogBox.ignoreLogs(["expo-notifications: Android Push notifications"]);

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
    <ErrorBoundary>
    <SafeAreaProvider>
      <SettingsProvider>
        <LocaleProvider>
        <OtaBootstrap />
        <OnboardingGate>
        <ZoneProvider>
        <ProductivityProvider>
        <WealthProvider>
        <RemindersProvider>
        <TxActionsProvider>
        <TaskActionsProvider>
        <OfflineProvider>
        <DownloadSettingsProvider>
        <CursorProvider>
        <SpotifyProvider>
          <FavoritesProvider>
            <PlayerProvider>
              <PlayerUiProvider>
                <TrackActionsProvider>
                <VideoActionsProvider>
                <PlaylistActionsProvider>
                <DockChrome>
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.void }}>
                    <StatusBar style="light" />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: {
                          backgroundColor: colors.void,
                          elevation: 0,
                          ...(Platform.OS === "web" ? { flex: 1 } : null),
                        },
                      }}
                    >
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="album/[id]" />
                      <Stack.Screen name="artist/[id]" />
                      <Stack.Screen name="imported/[id]" />
                      <Stack.Screen name="favorites" />
                      <Stack.Screen name="music" />
                      <Stack.Screen name="podcasts" />
                      <Stack.Screen name="video/browse/[id]" />
                      <Stack.Screen name="video/onepiece" />
                      <Stack.Screen name="video/series/[id]" />
                      <Stack.Screen name="video/saga/[id]" />
                      <Stack.Screen name="video/arc/[id]" />
                      <Stack.Screen name="watch/[...path]" options={{ animation: "fade" }} />
                      <Stack.Screen name="task/[id]" />
                      <Stack.Screen name="focus/today" />
                      <Stack.Screen name="focus/inbox" />
                      <Stack.Screen name="focus/reminders" />
                      <Stack.Screen name="projects" />
                      <Stack.Screen name="project/[id]" />
                      <Stack.Screen name="wealth/activity" />
                      <Stack.Screen name="wealth/assets" />
                      <Stack.Screen name="wealth/accounts" />
                      <Stack.Screen name="wealth/asset/[id]" />
                      <Stack.Screen name="now-playing" />
                      <Stack.Screen name="queue" />
                    </Stack>
                    <MiniPlayer />
                    <Dock />
                    <ChatSheet />
                    <NowPlayingSheet />
                    <TrackActionsSheet />
                    <VideoActionsSheet />
                    <PlaylistActionsSheet />
                    <TaskActionsSheet />
                    <TxActionsSheet />
                  </GestureHandlerRootView>
                </DockChrome>
                </PlaylistActionsProvider>
                </VideoActionsProvider>
                </TrackActionsProvider>
              </PlayerUiProvider>
          </PlayerProvider>
          </FavoritesProvider>
        </SpotifyProvider>
        </CursorProvider>
        </DownloadSettingsProvider>
        </OfflineProvider>
        </TaskActionsProvider>
        </TxActionsProvider>
        </RemindersProvider>
        </WealthProvider>
        </ProductivityProvider>
        </ZoneProvider>
        </OnboardingGate>
        </LocaleProvider>
      </SettingsProvider>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const { ready, onboardingNeeded } = useSettings();
  const { ready: i18nReady } = useI18n();
  if (!ready || !i18nReady) {
    return <View style={styles.boot} />;
  }
  return (
    <View style={styles.boot}>
      {children}
      {onboardingNeeded ? (
        <View style={styles.onboarding} pointerEvents="auto">
          <Onboarding />
        </View>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.void,
  },
  onboarding: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
    backgroundColor: colors.void,
  },
});
