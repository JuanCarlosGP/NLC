import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Play } from "lucide-react-native";
import { useVideoContinue } from "@/hooks/use-video-continue";
import { watchRoute } from "@/lib/video/onepiece";
import { isWatchFinished, type VideoWatchEntry } from "@/lib/video/watch-history";
import { useI18n } from "@/lib/i18n/context";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };

function progressRatio(entry: VideoWatchEntry): number {
  if (entry.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, entry.positionSec / entry.durationSec));
}

function progressLabel(entry: VideoWatchEntry, t: (path: string, vars?: Record<string, string | number>) => string): string | null {
  if (isWatchFinished(entry)) return t("videoUi.finished");
  if (entry.positionSec < 8 || entry.durationSec <= 0) return null;
  const left = Math.max(1, Math.round((entry.durationSec - entry.positionSec) / 60));
  return t("videoUi.minLeft", { count: left });
}

function ContinueCard({
  label,
  entry,
  onPress,
  t,
}: {
  label: string;
  entry: VideoWatchEntry;
  onPress: () => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  const ratio = progressRatio(entry);
  const remaining = progressLabel(entry, t);
  const place = [entry.arcTitle].filter((value) => value && value !== entry.seriesTitle).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${entry.title}`}
      android_ripple={RIPPLE}
      onPress={() => {
        triggerSelectionUiHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.card, Platform.OS !== "android" && pressed ? styles.pressed : null]}
    >
      <View style={styles.badge}>
        <Text style={styles.num}>{entry.number < 99_000 ? entry.number : "·"}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[place, remaining].filter(Boolean).join(" · ")}
        </Text>
        {ratio > 0 && !isWatchFinished(entry) ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(6, ratio * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <Play color={colors.inkSoft} size={18} strokeWidth={2} />
    </Pressable>
  );
}

export function ContinueWatching() {
  const { t } = useI18n();
  const router = useRouter();
  const { rows } = useVideoContinue();

  const open = (entry: VideoWatchEntry, resume: boolean) => {
    const route = watchRoute(entry.path, entry.arcPath);
    const start = resume && !isWatchFinished(entry) && entry.positionSec > 3 ? Math.floor(entry.positionSec) : 0;
    router.push({
      ...route,
      params: { ...route.params, start: String(start) },
    });
  };

  if (!rows.length) {
    return (
      <View style={styles.block}>
        <Text style={type.label}>{t("videoUi.continue")}</Text>
        <Text style={type.meta}>{t("videoUi.continueHint")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={type.label}>{t("videoUi.continue")}</Text>
      {rows.map(({ last, next }) => (
        <View key={last.path} style={styles.series}>
          <Text style={styles.seriesTitle}>{last.seriesTitle}</Text>
          <ContinueCard label={t("videoUi.resume")} entry={last} t={t} onPress={() => open(last, true)} />
          {next ? <ContinueCard label={t("videoUi.next")} entry={next} t={t} onPress={() => open(next, false)} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 14 },
  series: { gap: 10 },
  seriesTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.inkSoft,
  },
  card: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.sheetRaised,
    overflow: "hidden",
  },
  pressed: { opacity: 0.86 },
  badge: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#322A38",
    alignItems: "center",
    justifyContent: "center",
  },
  num: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.accent,
    fontVariant: ["tabular-nums"],
  },
  meta: { flex: 1, gap: 2 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  track: {
    marginTop: 6,
    height: 3,
    borderRadius: 99,
    backgroundColor: colors.rule,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
});
