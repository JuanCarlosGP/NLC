import * as local from "./storage.impl";
import { expose } from "@/lib/backend/registry";
export * from "./storage.impl";
export const loadNasSettings = expose("settings.read", local.loadNasSettings, { domain: "settings" });
export const saveNasSettings = expose("settings.save", local.saveNasSettings, { domain: "settings", write: true });
// The server installs redacted read and explicit patch handlers instead of these local secret methods.
export const loadNasPassword = expose("settings.passwordState", local.loadNasPassword, { domain: "credentials" });
export const saveNasPassword = expose("settings.password", local.saveNasPassword, { domain: "credentials", write: true, atomic: false });
export const loadOnboardingComplete = expose("settings.onboarded", local.loadOnboardingComplete, { domain: "settings" });
export const saveOnboardingComplete = expose("settings.onboard", local.saveOnboardingComplete, { domain: "settings", write: true, phoneOnly: true });
export const clearOnboardingComplete = expose("settings.replay", local.clearOnboardingComplete, { domain: "settings", write: true, phoneOnly: true });
