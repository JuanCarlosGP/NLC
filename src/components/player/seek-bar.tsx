import { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function SeekBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const [draft, setDraft] = useState<number | null>(null);
  const progress = duration > 0 ? Math.min(1, (draft ?? currentTime) / duration) : 0;

  useEffect(() => {
    setDraft(null);
  }, [currentTime]);

  const displayed = useMemo(() => draft ?? currentTime, [draft, currentTime]);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onLayout={onLayout}
        onPress={(event) => {
          if (!duration) return;
          const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
          onSeek(ratio * duration);
        }}
        style={styles.hit}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(displayed)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hit: { height: 28, justifyContent: "center" },
  track: {
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.ruleLight,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  times: { flexDirection: "row", justifyContent: "space-between" },
  time: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
});
