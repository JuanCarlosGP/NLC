import type { NasSettings } from "@/lib/settings/storage.impl";

export async function registerOtaPush(_settings: NasSettings, _password: string): Promise<void> {}

export function subscribeOtaNotifications(): () => void {
  return () => {};
}
