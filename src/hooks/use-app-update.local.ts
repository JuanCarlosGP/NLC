import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import { applyOtaUpdate, checkOtaAvailable, getOtaInfo, type OtaInfo } from "@/lib/ota/apply-update";
import { fetchRemoteApk, isRemoteApkNewer, type RemoteApk } from "@/lib/ota/github-apk";
import { downloadAndInstallApk } from "@/lib/ota/install-apk";
import { t } from "@/lib/i18n/runtime";

export type ApkStatus = "loading" | "current" | "apk" | "none" | "error";
export type OtaStatus = "loading" | "current" | "available" | "unsupported";

function localApkIdentity() {
  const version = Constants.expoConfig?.version ?? "0.1.0";
  const codeRaw = Constants.nativeBuildVersion;
  const code = codeRaw && /^\d+$/.test(codeRaw) ? Number(codeRaw) : null;
  return { version, code };
}

export function usePendingUpdate() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { version, code } = localApkIdentity();
    void Promise.all([
      fetchRemoteApk()
        .then((remote) => Boolean(remote && isRemoteApkNewer(remote, version, code)))
        .catch(() => false),
      checkOtaAvailable().catch(() => false),
    ]).then(([apk, ota]) => {
      if (!cancelled) setPending(apk || ota);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return pending;
}

export function useAppUpdate() {
  const { version: localVersion, code: localCode } = localApkIdentity();
  const [remote, setRemote] = useState<RemoteApk | null>(null);
  const [ota, setOta] = useState<OtaInfo>({ supported: false, available: false, channel: null });
  const [apkStatus, setApkStatus] = useState<ApkStatus>("loading");
  const [otaStatus, setOtaStatus] = useState<OtaStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [apkProgress, setApkProgress] = useState<number | null>(null);
  const [apkError, setApkError] = useState(false);

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
    if (apkProgress != null) return;
    setApkError(false);
    setApkProgress(0);
    void downloadAndInstallApk((ratio) => setApkProgress(ratio))
      .catch(() => setApkError(true))
      .finally(() => setApkProgress(null));
  }, [apkProgress]);

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
    apkProgress != null
      ? apkProgress >= 1
        ? t("update.openingInstaller")
        : t("update.downloadingGithub", { pct: Math.round(apkProgress * 100) })
      : apkError
        ? t("update.apkFail")
        : apkStatus === "loading"
          ? t("update.checkingGithub")
          : apkStatus === "apk"
            ? t("update.apkNew", { version: remote ? ` · ${remote.version}` : "" })
            : apkStatus === "current"
              ? t("update.apkCurrent")
              : apkStatus === "error"
                ? t("update.apkCheckFail")
                : t("update.apkNone");
  const otaChannel = ota.channel ? ` · ${ota.channel}` : "";
  const otaSummary =
    otaStatus === "loading"
      ? t("update.checkingOta")
      : otaStatus === "available"
        ? t("update.otaNew")
        : otaStatus === "current"
          ? t("update.otaCurrent", { channel: otaChannel })
          : t("update.otaApkOnly");

  return {
    localVersion,
    buildLabel,
    remote,
    apkStatus,
    otaStatus,
    busy,
    apkProgress,
    apkError,
    apkSummary,
    otaSummary,
    refresh,
    downloadApk,
    applyOta,
  };
}
