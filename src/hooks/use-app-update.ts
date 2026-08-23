import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { applyOtaUpdate, getOtaInfo, type OtaInfo } from "@/lib/ota/apply-update";
import {
  fetchRemoteApk,
  GITHUB_APK_DOWNLOAD,
  isRemoteApkNewer,
  type RemoteApk,
} from "@/lib/ota/github-apk";

export type ApkStatus = "loading" | "current" | "apk" | "none" | "error";
export type OtaStatus = "loading" | "current" | "available" | "unsupported";

export function useAppUpdate() {
  const localVersion = Constants.expoConfig?.version ?? "0.1.0";
  const localCodeRaw = Constants.nativeBuildVersion;
  const localCode = localCodeRaw && /^\d+$/.test(localCodeRaw) ? Number(localCodeRaw) : null;
  const [remote, setRemote] = useState<RemoteApk | null>(null);
  const [ota, setOta] = useState<OtaInfo>({ supported: false, available: false, channel: null });
  const [apkStatus, setApkStatus] = useState<ApkStatus>("loading");
  const [otaStatus, setOtaStatus] = useState<OtaStatus>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setApkStatus("loading");
    setOtaStatus("loading");
    let nextRemote: RemoteApk | null = null;
    let nextOta: OtaInfo = { supported: false, available: false, channel: null };
    try {
      nextRemote = await fetchRemoteApk();
      setRemote(nextRemote);
      setApkStatus(
        nextRemote && isRemoteApkNewer(nextRemote, localVersion, localCode)
          ? "apk"
          : nextRemote
            ? "current"
            : "none",
      );
    } catch {
      setRemote(null);
      setApkStatus("error");
    }
    try {
      nextOta = await getOtaInfo();
    } catch {
      nextOta = { supported: false, available: false, channel: null };
    }
    setOta(nextOta);
    setOtaStatus(
      !nextOta.supported ? "unsupported" : nextOta.available ? "available" : "current",
    );
  }, [localCode, localVersion]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloadApk = useCallback(() => {
    void Linking.openURL(GITHUB_APK_DOWNLOAD);
  }, []);

  const applyOta = useCallback(async () => {
    setBusy(true);
    try {
      await applyOtaUpdate();
    } finally {
      setBusy(false);
    }
  }, []);

  const buildLabel = localCode ? `${localVersion} (${localCode})` : localVersion;
  const apkSummary =
    apkStatus === "loading"
      ? "Comprobando GitHub…"
      : apkStatus === "apk"
        ? `Hay una APK nueva${remote ? ` · ${remote.version}` : ""}. Toca para descargarla.`
        : apkStatus === "current"
          ? "Estás en la última APK"
          : apkStatus === "error"
            ? "No se pudo comprobar GitHub"
            : "Aún no hay APK publicada";
  const otaChannel = ota.channel ? ` · ${ota.channel}` : "";
  const otaSummary =
    otaStatus === "loading"
      ? "Comprobando canal OTA…"
      : otaStatus === "available"
        ? "Hay una OTA nueva. Toca para instalarla."
        : otaStatus === "current"
          ? `Estás en la última OTA${otaChannel}`
          : "La OTA solo llega en la APK del teléfono";

  return {
    localVersion,
    buildLabel,
    remote,
    apkStatus,
    otaStatus,
    busy,
    apkSummary,
    otaSummary,
    refresh,
    downloadApk,
    applyOta,
  };
}
