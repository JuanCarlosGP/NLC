import { remoteEnabled, PHONE_ONLY } from "@/lib/backend/profile";
import { Platform, Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles, densityData } from "@/lib/appearance/density";
import { sourceMode, withSourceMode } from "@/lib/settings/service-source";
import { useSettings } from "@/lib/settings/settings-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { isMediaZone } from "@/lib/zone/zone-context";
import type { ServiceId } from "@/lib/settings/storage";
import { useState } from "react";
export function ServiceSourcePicker({ service, showLabel = true }: { service: ServiceId; showLabel?: boolean }) {
  useThemeId();
  const { t } = useI18n();
  const { settings, persist } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const current = sourceMode(settings, service);
  const browser = Platform.OS === "web" && !remoteEnabled;
  const media = isMediaZone(service);
  const labels = {
    local: browser ? (media ? "computer" : "browser") : "local",
    nas: "nas",
    both: browser ? (media ? "bothComputer" : "bothBrowser") : "both",
  };
  return (
    <View style={styles.body} {...densityData("settings-source-picker")}>
      {(showLabel || remoteEnabled) && <Text style={type.label}>{remoteEnabled ? PHONE_ONLY : t("localSetup.storage")}</Text>}
      <View style={styles.row}>
        {(["local", "nas", "both"] as const).map((mode) => (
          <Pressable
            key={mode}
            disabled={busy || remoteEnabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === mode, disabled: busy || remoteEnabled }}
            style={[styles.choice, current === mode && styles.on]}
            onPress={() => {
              setBusy(true);
              setError(false);
              void persist(withSourceMode(settings, service, mode))
                .catch(() => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            <Text style={type.meta}>{t(`localSetup.${labels[mode]}`)}</Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text style={[type.meta, { color: colors.danger }]}>
          {t("onboarding.saveFail")}
        </Text>
      ) : null}
    </View>
  );
}
const styles = createStyles(() => ({
  body: { gap: 8 },
  row: { flexDirection: "row", gap: 6 },
  choice: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderColor: colors.rule,
    borderWidth: 1,
  },
  on: { borderColor: colors.accent, backgroundColor: colors.sheetRaised },
}));
