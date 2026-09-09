import { useEffect, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { Field } from "@/components/settings/source-fields";
import { DesktopQrCamera } from "@/components/settings/desktop-qr-camera";
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

export default function DesktopBridgeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedHost, setLinkedHost] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [token, host] = await Promise.all([loadBridgeToken(), loadDesktopHost()]);
      setLinkedHost(token && host ? host : null);
    })();
  }, []);

  async function connect(raw: string) {
    const parsed = parsePairQr(raw);
    if (!parsed) {
      setError(t("desktop.badQr"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === "android" && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch {
          // Best-effort.
        }
      }
      const { startLanBridge } = await import("nlc-lan-bridge");
      await startLanBridge(BRIDGE_PORT, parsed.token);
      await pairWithDesktop(parsed.host, parsed.port, parsed.token);
      await saveBridgeToken(parsed.token);
      await saveDesktopHost(parsed.host);
      setLinkedHost(parsed.host);
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/settings");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("native module") ? t("desktop.androidOnly") : message || t("desktop.pairFail"),
      );
      try {
        const { stopLanBridge } = await import("nlc-lan-bridge");
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
      const { stopLanBridge } = await import("nlc-lan-bridge");
      await stopLanBridge();
      await clearBridgeSession();
      setLinkedHost(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={type.label}>{t("desktop.kicker")}</Text>
      <Text style={[type.pageTitle, styles.title]}>{t("desktop.title")}</Text>
      <Text style={styles.hint}>{t("desktop.hint")}</Text>

      {linkedHost ? (
        <View style={styles.block}>
          <Text style={styles.status}>{t("desktop.linkedTo", { host: linkedHost })}</Text>
          <Pressable disabled={busy} onPress={() => void unlink()} style={styles.button}>
            <Text style={styles.buttonLabel}>{t("desktop.unlink")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.block}>
          <DesktopQrCamera disabled={busy} onScan={(raw) => void connect(raw)} />
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
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={() => {
          triggerUiHaptic();
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/settings");
        }}
        style={styles.back}
      >
        <Text style={styles.backLabel}>{t("desktop.close")}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 8 },
  hint: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  block: { gap: 12 },
  status: { color: colors.inkSoft, fontFamily: fonts.sans, fontSize: 15 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonOff: { opacity: 0.45 },
  buttonLabel: { color: colors.accentText, fontFamily: fonts.sansSemiBold, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.sans, fontSize: 14, marginTop: 12 },
  back: { marginTop: 24, alignItems: "center", paddingVertical: 12 },
  backLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 15 },
});
