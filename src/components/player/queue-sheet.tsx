import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { TrackRow } from "@/components/library/track-row";
import { useQueue } from "@/hooks/use-queue";
import { useI18n } from "@/lib/i18n/context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { type } from "@/lib/theme";

export function QueueSheet() {
  const { queueOpen, setQueueOpen } = usePlayerUi();
  const { t } = useI18n();

  return (
    <BottomSheet
      open={queueOpen}
      onOpenChange={setQueueOpen}
      accessibilityCloseLabel={t("sheet.close")}
      viewportRatio={0.75}
    >
      <QueueBody />
    </BottomSheet>
  );
}

function QueueBody() {
  const { t } = useI18n();
  const { queue, index, playTracks, current } = useQueue();

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.label}>{t("player.playback")}</Text>
      <Text style={type.pageTitle}>{t("player.queue")}</Text>
      {!queue.length ? <Text style={type.body}>{t("player.queueEmpty")}</Text> : null}
      <View>
        {queue.map((track, i) => (
          <TrackRow
            key={`${track.id}-${i}`}
            track={track}
            index={i + 1}
            active={current?.id === track.id && i === index}
            onPress={() => void playTracks(queue, i)}
          />
        ))}
      </View>
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 8,
  },
});
