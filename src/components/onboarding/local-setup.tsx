import { useState } from "react";
import { Pressable, View } from "react-native";
import { Folder, Smartphone, Server, Check } from "lucide-react-native";
import { Text } from "@/components/ui/themed-text";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { colors, type } from "@/lib/theme";
import { useI18n } from "@/lib/i18n/context";
import { pickLocalFolder } from "@/lib/local/pick-folder";
import {
  SERVICES,
  localFolder,
  withLocalFolder,
} from "@/lib/settings/service-source";
import type { NasSettings, ServiceId } from "@/lib/settings/storage";

export function LocalSetup({
  mode,
  onModeChange,
  settings,
  onSettingsChange,
  onBusyChange,
}: {
  mode?: "local" | "nas";
  onModeChange?: (mode: "local" | "nas") => void;
  settings?: NasSettings;
  onSettingsChange?: (settings: NasSettings) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  useThemeId();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function choose(id: ServiceId) {
    if (!settings || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(false);
    try {
      const folder = await pickLocalFolder();
      if (folder)
        onSettingsChange?.(
          withLocalFolder(settings, id, folder.uri, folder.name),
        );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <View style={styles.body}>
      <Text style={type.pageTitle}>
        {t(settings ? "localSetup.folders" : "localSetup.title")}
      </Text>
      <Text style={type.body}>
        {t(settings ? "localSetup.foldersHint" : "localSetup.hint")}
      </Text>
      {settings
        ? SERVICES.map((id) => {
            const folder = localFolder(settings, id);
            return (
              <View key={id} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("localSetup.pick")} · ${t(`zones.${id}`)}`}
                  disabled={busy}
                  onPress={() => void choose(id)}
                  style={styles.row}
                >
                  <Folder size={20} color={colors.inkSoft} />
                  <View style={styles.text}>
                    <Text style={type.track}>{t(`zones.${id}`)}</Text>
                    <Text style={type.meta}>
                      {folder.name || t("localSetup.later")}
                    </Text>
                  </View>
                  {folder.uri ? <Check size={18} color={colors.ok} /> : null}
                </Pressable>
                {folder.uri ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={styles.reset}
                    onPress={() =>
                      onSettingsChange?.(withLocalFolder(settings, id, "", ""))
                    }
                  >
                    <Text style={type.meta}>{t("localSetup.useInternal")}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        : (["local", "nas"] as const).map((value) => {
            const Icon = value === "local" ? Smartphone : Server;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === value }}
                onPress={() => onModeChange?.(value)}
                style={[
                  styles.card,
                  styles.row,
                  mode === value && styles.selected,
                ]}
              >
                <Icon size={24} color={colors.ink} />
                <View style={styles.text}>
                  <Text style={type.track}>
                    {t(
                      value === "local" ? "localSetup.phone" : "localSetup.nas",
                    )}
                  </Text>
                  <Text style={type.body}>
                    {t(
                      value === "local"
                        ? "localSetup.phoneHint"
                        : "localSetup.nasHint",
                    )}
                  </Text>
                </View>
                {mode === value ? (
                  <Check size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            );
          })}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.body, { color: colors.danger }]}
        >
          {t("localSetup.folderError")}
        </Text>
      ) : null}
    </View>
  );
}
const styles = createStyles(() => ({
  body: { gap: 14 },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    backgroundColor: colors.sheet,
  },
  row: {
    minHeight: 56,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  text: { flex: 1, gap: 4 },
  selected: { borderColor: colors.accent },
  reset: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
}));
