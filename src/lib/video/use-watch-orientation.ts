import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

async function lock(orientation: ScreenOrientation.OrientationLock) {
  if (Platform.OS === "web") return;
  try {
    await ScreenOrientation.lockAsync(orientation);
  } catch {
    // Expo Go / missing native module: keep playback, skip rotate.
  }
}

export function useWatchOrientation() {
  const [landscape, setLandscape] = useState(false);

  const restorePortrait = useCallback(() => {
    setLandscape(false);
    void lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const toggleLandscape = useCallback(() => {
    setLandscape((on) => {
      const next = !on;
      void lock(
        next
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") restorePortrait();
    });
    return () => {
      sub.remove();
      void lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [restorePortrait]);

  return { landscape, toggleLandscape };
}
