import * as local from "./download-settings.impl";
import { expose } from "@/lib/backend/registry";
export * from "./download-settings.impl";
export const loadDownloadSettings = expose("downloader.settings", local.loadDownloadSettings, { domain: "downloader" });
export const saveDownloadSettings = expose("downloader.saveSettings", local.saveDownloadSettings, { domain: "downloader", write: true, atomic: false });
export const loadDownloadToken = expose("downloader.tokenState", local.loadDownloadToken, { domain: "credentials" });
export const saveDownloadToken = expose("downloader.token", local.saveDownloadToken, { domain: "credentials", write: true, atomic: false });
