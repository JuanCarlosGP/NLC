import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { mercuryController as controller, loadMercuryController } from "./mercury-controller.native";
import type { MobileMercuryConnection, MobileMercuryHookOptions } from "./mobile-types";
export function useMobileMercury(options: MobileMercuryHookOptions): MobileMercuryConnection | null {
 const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
 useEffect(() => { if (!options.ready) return; let active = true;
  const tick = () => { if (active && options.allowAutomatic?.() !== false && AppState.currentState === "active") void controller.tick().catch(() => {}); };
  void loadMercuryController().then(tick); const timer = setInterval(tick, 30000); const event = AppState.addEventListener("change", tick);
  return () => { active = false; clearInterval(timer); event.remove(); };
 }, [options.ready]);
 return useMemo(() => ({ state, configure: controller.configure, disconnect: controller.disconnect, sync: controller.sync, acceptPending: controller.acceptPending, rejectPending: controller.rejectPending, retryStorage: controller.retryStorage }), [state]);
}
