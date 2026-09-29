import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Switch, Text, View } from "react-native";
import { getLanAddress, isLanBridgeAvailable } from "nlc-lan-bridge";
import { loadWebTuiEnabled, saveWebTuiEnabled, startPhoneWebTui, stopPhoneWebTui, webTuiUrl } from "@/lib/bridge/web-tui";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function DesktopWebTui() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const android = Platform.OS === "android" && isLanBridgeAvailable;

  const refreshUrl = useCallback(() => {
    if (!android) {
      setUrl(null);
      return;
    }
    try {
      const lan = getLanAddress();
      setUrl(lan && lan !== "0.0.0.0" ? webTuiUrl(lan) : null);
    } catch {
      setUrl(null);
    }
  }, [android]);

  useEffect(() => {
    let active = true;
    void loadWebTuiEnabled().then(async (on) => {
      if (!active) return;
      setEnabled(on);
      if (!on || !android) return;
      try {
        await startPhoneWebTui();
        if (active) refreshUrl();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!active) return;
        setEnabled(false);
        await saveWebTuiEnabled(false);
        if (message === "busy") setError(t("desktop.webBusy"));
        else if (message === "missing") setError(t("desktop.webOld"));
        else setError(t("desktop.webFail"));
      }
    });
    refreshUrl();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshUrl();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [refreshUrl]);

  async function toggle(next: boolean) {
    triggerUiHaptic();
    setError(null);
    setEnabled(next);
    if (next) refreshUrl();
    await saveWebTuiEnabled(next);
    try {
      if (next) await startPhoneWebTui();
      else await stopPhoneWebTui();
      if (next) refreshUrl();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setEnabled(false);
      await saveWebTuiEnabled(false);
      if (message === "busy") setError(t("desktop.webBusy"));
      else if (message === "missing") setError(t("desktop.webOld"));
      else setError(t("desktop.webFail"));
    }
  }

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.meta}>
          <Text style={styles.title}>{t("desktop.webTitle")}</Text>
          <Text style={styles.hint}>{android ? t("desktop.webHint") : t("desktop.androidOnly")}</Text>
        </View>
        <Switch
          accessibilityLabel={t("desktop.webTitle")}
          disabled={!android}
          value={enabled}
          onValueChange={(value) => void toggle(value)}
          trackColor={{ false: colors.rule, true: colors.accent }}
          thumbColor={colors.ink}
        />
      </View>
      {enabled && android ? (
        <Text selectable style={styles.url}>
          {url ?? t("desktop.webNoLan")}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  meta: { flex: 1, gap: 3 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  url: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accent,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
});
