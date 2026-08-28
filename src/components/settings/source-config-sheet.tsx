import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { Field, SwitchRow } from "@/components/settings/source-fields";
import type { SettingsFeedback } from "@/hooks/use-nas-settings";
import { useI18n } from "@/lib/i18n/context";
import type { NasSettings } from "@/lib/settings/storage";
import { colors, fonts, type } from "@/lib/theme";

export function SourceConfigSheet({
  open,
  onOpenChange,
  settings,
  setSettings,
  password,
  setPassword,
  feedback,
  busy,
  testConnection,
  save,
  variant = "music",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: NasSettings;
  setSettings: (next: NasSettings) => void;
  password: string;
  setPassword: (next: string) => void;
  feedback: SettingsFeedback | null;
  busy: boolean;
  testConnection: () => Promise<void>;
  save: () => Promise<void>;
  variant?: "music" | "podcast" | "video" | "wealth" | "focus";
}) {
  const { t } = useI18n();
  const shared = settings.sourceKind !== "mock";
  const folderPlaceholder =
    variant === "video"
      ? "/Video"
      : variant === "podcast"
        ? "/Podcasts"
        : variant === "wealth" || variant === "focus"
          ? "/Finanzas"
          : "/Music";
  const title =
    variant === "video"
      ? t("sourceSheet.videoTitle")
      : variant === "podcast"
        ? t("sourceSheet.podcastTitle")
        : variant === "wealth"
          ? t("sourceSheet.wealthTitle")
          : variant === "focus"
            ? t("sourceSheet.focusTitle")
            : t("sourceSheet.musicTitle");
  const summary = `${settings.useHttps ? "https" : "http"}://${settings.host}:${settings.port}`;
  const folderHint =
    variant === "video"
      ? t("sourceSheet.videoHint")
      : variant === "podcast"
        ? t("sourceSheet.podcastHint")
        : variant === "wealth"
          ? t("sourceSheet.wealthHint")
          : variant === "focus"
            ? t("sourceSheet.focusHint")
            : t("sourceSheet.musicHint");

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("sourceSheet.close")}
      viewportRatio={0.82}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>{t("sourceSheet.title")}</Text>
          <Text style={type.pageTitle}>{title}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("sourceSheet.connection")}</Text>
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <View style={styles.pair}>
                <View style={styles.pairItem}>
                  <Field
                    label={t("sourceSheet.host")}
                    value={settings.host}
                    onChange={(host) => setSettings({ ...settings, host })}
                    autoCapitalize="none"
                    accessibilityLabel={t("sourceSheet.host")}
                  />
                </View>
                <View style={[styles.pairItem, styles.port]}>
                  <Field
                    label={t("sourceSheet.port")}
                    value={settings.port}
                    onChange={(port) => setSettings({ ...settings, port })}
                    keyboardType="number-pad"
                    accessibilityLabel={t("sourceSheet.port")}
                  />
                </View>
              </View>
              <Field
                label={t("sourceSheet.user")}
                value={settings.username}
                onChange={(username) => setSettings({ ...settings, username })}
                autoCapitalize="none"
                accessibilityLabel={t("sourceSheet.user")}
              />
              <Field
                label={t("sourceSheet.password")}
                value={password}
                onChange={setPassword}
                secure
                autoCapitalize="none"
                accessibilityLabel={t("sourceSheet.password")}
              />
              {settings.sourceKind === "webdav" ? (
                <Field
                  label={t("sourceSheet.path")}
                  value={settings.sharePath}
                  onChange={(sharePath) => setSettings({ ...settings, sharePath })}
                  placeholder={folderPlaceholder}
                  hint={folderHint}
                  autoCapitalize="none"
                  accessibilityLabel={t("sourceSheet.path")}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("sourceSheet.access")}</Text>
          <View style={styles.card}>
            <SwitchRow
              label={t("sourceSheet.https")}
              hint={summary}
              value={settings.useHttps}
              onValueChange={(useHttps) => setSettings({ ...settings, useHttps })}
              accessibilityLabel={t("sourceSheet.https")}
            />

            {settings.sourceKind === "opensubsonic" && variant !== "wealth" && variant !== "focus" ? (
              <View style={styles.cardBody}>
                <Text style={type.label}>{t("sourceSheet.streamQuality")}</Text>
                <View style={styles.row}>
                  {[
                    { id: "0", label: t("sourceSheet.original") },
                    { id: "320", label: "320 kbps" },
                    { id: "192", label: "192 kbps" },
                  ].map((item) => {
                    const active = settings.maxBitRate === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setSettings({ ...settings, maxBitRate: item.id })}
                        style={[styles.choice, active && styles.choiceActive]}
                      >
                        <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("sourceSheet.testConnection")}
                onPress={() => void testConnection()}
                disabled={busy || !shared}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhost,
                  { opacity: busy || !shared ? 0.45 : pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.btnGhostText}>{busy ? t("common.testing") : t("common.test")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.save")}
                onPress={() => void save()}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.btnSolid, { opacity: pressed || busy ? 0.7 : 1 }]}
              >
                <Text style={styles.btnSolidText}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {feedback ? (
          <Text
            accessibilityRole={feedback.color === colors.danger || feedback.color === colors.warn ? "alert" : undefined}
            style={[type.body, styles.feedback, { color: feedback.color }]}
          >
            {feedback.text}
          </Text>
        ) : null}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 48,
    gap: 22,
  },
  titleMeta: { gap: 4 },
  section: { gap: 10 },
  sectionLabel: {
    ...type.label,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardBody: {
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  pair: { flexDirection: "row", gap: 10 },
  pairItem: { flex: 1 },
  port: { maxWidth: 110 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.void,
  },
  choiceActive: { backgroundColor: colors.sheetRaised, borderColor: colors.accent },
  choiceLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  choiceLabelActive: { color: colors.ink },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  btnGhost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  btnSolid: { backgroundColor: colors.accent },
  btnGhostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  btnSolidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  feedback: { paddingHorizontal: 2 },
});
