import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { fetch as nativeFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { fetchMercurySnapshot } from "./mercury-api";
import { createMobileMercury } from "./mercury-mobile";
import type { MobileMercuryConnection, MobileMercuryHookOptions } from "./mobile-types";

const TOKEN_KEY = "nlc.integrations.mercury.token.v1";
export function useMobileMercury(options: MobileMercuryHookOptions): MobileMercuryConnection | null {
  const [controller] = useState(() => createMobileMercury({
    secrets: {
      read: () => SecureStore.getItemAsync(TOKEN_KEY),
      write: token => SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
      remove: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    },
    collect: (token, signal) => fetchMercurySnapshot(token, nativeFetch, signal),
    current: options.current, save: options.save, allowAutomatic: options.allowAutomatic,
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (!options.ready) return;
    let active = true;
    const tick = () => { if (active && AppState.currentState === "active") void controller.tick().catch(() => {}); };
    void controller.load().then(tick);
    const timer = setInterval(tick, 30000);
    const event = AppState.addEventListener("change", value => { if (value === "active") tick(); else controller.cancel(); });
    return () => { active = false; clearInterval(timer); event.remove(); controller.cancel(); };
  }, [options.ready, controller]);
  return useMemo(() => ({ state, configure: controller.configure, disconnect: controller.disconnect, sync: controller.sync,
    acceptPending: controller.acceptPending, rejectPending: controller.rejectPending, retryStorage: controller.retryStorage }), [state, controller]);
}
