import type { NasSettings, ServiceId, ServiceSourceMode } from "./storage";
export const SERVICES: ServiceId[] = [
  "music",
  "podcast",
  "video",
  "focus",
  "wealth",
  "health",
];
export function sourceMode(
  settings: NasSettings,
  service: ServiceId,
): ServiceSourceMode {
  return (
    settings.serviceSources?.[service] ??
    (service === "health"
      ? "local"
      : settings.sourceKind === "local"
        ? "local"
        : "both")
  );
}
export const usesNas = (settings: NasSettings, service: ServiceId) =>
  sourceMode(settings, service) !== "local";
export const usesLocal = (settings: NasSettings, service: ServiceId) =>
  sourceMode(settings, service) !== "nas";
export function withSourceMode(
  settings: NasSettings,
  service: ServiceId,
  mode: ServiceSourceMode,
): NasSettings {
  return {
    ...settings,
    serviceSources: { ...settings.serviceSources, [service]: mode },
  };
}
export function localFolder(settings: NasSettings, service: ServiceId) {
  if (service === "music")
    return { uri: settings.localFolderUri, name: settings.localFolderName };
  const prefix = service === "podcast" ? "podcast" : service;
  return {
    uri: settings[`${prefix}LocalFolderUri`] ?? "",
    name: settings[`${prefix}LocalFolderName`] ?? "",
  };
}
export function withLocalFolder(
  settings: NasSettings,
  service: ServiceId,
  uri: string,
  name: string,
): NasSettings {
  const prefix = service === "music" ? "" : service;
  return {
    ...settings,
    [prefix ? `${prefix}LocalFolderUri` : "localFolderUri"]: uri,
    [prefix ? `${prefix}LocalFolderName` : "localFolderName"]: name,
  };
}
export function phoneOnly(settings: NasSettings): NasSettings {
  return {
    ...settings,
    sourceKind: "local",
    serviceSources: Object.fromEntries(SERVICES.map((id) => [id, "local"])),
  };
}
