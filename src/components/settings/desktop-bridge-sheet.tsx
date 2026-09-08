import { useEffect, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { isLanBridgeAvailable, startLanBridge, stopLanBridge } from "nlc-lan-bridge";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { Field } from "@/components/settings/source-fields";
import { pairWithDesktop } from "@/lib/bridge/pair";
import {
  BRIDGE_PORT,
  clearBridgeSession,
  loadBridgeToken,
  loadDesktopHost,
  parsePairQr,
  saveBridgeToken,
  saveDesktopHost,
} from "@/lib/bridge/session";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function DesktopBridgeSheet({
  open,
  onOpenChange,
  onStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatus: (linked: boolean, summary: string) => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedHost, setLinkedHost] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPaste("");
      setScanned(false);
      setBusy(false);
      return;
    }
    void (async () => {
      const [token, host] = await Promise.all([loadBridgeToken(), loadDesktopHost()]);
      setLinkedHost(token && host ? host : null);
    })();
  }, [open]);

  async function ensureNotifyPermission() {
    if (Platform.OS !== "android" || Platform.Version < 33) return;
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // Best-effort: the FGS still starts.
    }
  }

  async function connect(raw: string) {
    const parsed = parsePairQr(raw);
    if (!parsed) {
      setError(t("desktop.badQr"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureNotifyPermission();
      await startLanBridge(BRIDGE_PORT, parsed.token);
      await pairWithDesktop(parsed.host, parsed.port, parsed.token);
      await saveBridgeToken(parsed.token);
      await saveDesktopHost(parsed.host);
      setLinkedHost(parsed.host);
      onStatus(true, parsed.host);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("desktop.pairFail"));
      try {
        await stopLanBridge();
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    triggerUiHaptic();
    setBusy(true);
    try {
      await stopLanBridge();
      await clearBridgeSession();
      setLinkedHost(null);
      onStatus(false, t("settings.desktopIdle"));
    } finally {
      setBusy(false);
    }
  }

  const cameraOn = isLanBridgeAvailable && open && !linkedHost && !busy && Boolean(permission?.granted);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("desktop.close")}
      viewportRatio={0.88}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>{t("desktop.kicker")}</Text>
          <Text style={type.pageTitle}>{t("desktop.title")}</Text>
          <Text style={styles.hint}>{t("desktop.hint")}</Text>
        </View>

        {!isLanBridgeAvailable ? <Text style={styles.error}>{t("desktop.androidOnly")}</Text> : null}

        {linkedHost ? (
          <View style={styles.block}>
            <Text style={styles.status}>{t("desktop.linkedTo", { host: linkedHost })}</Text>
            <Pressable disabled={busy} onPress={() => void unlink()} style={styles.button}>
              <Text style={styles.buttonLabel}>{t("desktop.unlink")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {permission && !permission.granted ? (
              <Pressable
                onPress={() => {
                  triggerUiHaptic();
                  void requestPermission();
                }}
                style={styles.button}
              >
                <Text style={styles.buttonLabel}>{t("desktop.camera")}</Text>
              </Pressable>
            ) : null}

            {cameraOn ? (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (scanned || busy) return;
                    setScanned(true);
                    triggerUiHaptic();
                    void connect(data);
                  }}
                />
              </View>
            ) : null}

            <Field
              label={t("desktop.paste")}
              value={paste}
              onChange={setPaste}
              autoCapitalize="none"
              placeholder="nlc://192.168.1.2:7420/pair?token=…"
            />
            <Pressable
              disabled={busy || !paste.trim()}
              onPress={() => {
                triggerUiHaptic();
                void connect(paste);
              }}
              style={[styles.button, busy || !paste.trim() ? styles.buttonOff : null]}
            >
              <Text style={styles.buttonLabel}>{busy ? t("desktop.working") : t("desktop.connect")}</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, gap: 16 },
  titleMeta: { gap: 6 },
  hint: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  block: { gap: 12 },
  status: { color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 15 },
  cameraWrap: {
    height: 240,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: colors.sheetRaised,
  },
  camera: { flex: 1 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonOff: { opacity: 0.45 },
  buttonLabel: { color: colors.accentText, fontFamily: fonts.sansSemiBold, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.sans, fontSize: 14 },
});
