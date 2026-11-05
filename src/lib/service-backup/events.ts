import { useSyncExternalStore } from "react";
import type { NasSettings, ServiceId } from "@/lib/settings/storage.impl";
type Listener = (service: ServiceId, settings: NasSettings) => void;
const listeners = new Set<Listener>();
let revision = 0;
export function onServiceImport(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function notifyServiceImport(service: ServiceId, settings: NasSettings) {
  revision++;
  for (const fn of listeners) fn(service, settings);
}
export function useServiceRevision() {
  return useSyncExternalStore(
    onServiceImport,
    () => revision,
    () => 0,
  );
}
