import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { TrackRow } from "@/components/library/track-row";
import { Cover } from "@/components/ui/cover";
import { SeekBar } from "@/components/player/seek-bar";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { useNowPlaying } from "@/hooks/use-now-playing";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function NowPlayingSheet() {
  const { nowPlayingOpen, setNowPlayingOpen } = usePlayerUi();

  return (
    <BottomSheet
      open={nowPlayingOpen}
      onOpenChange={setNowPlayingOpen}
      accessibilityCloseLabel="Cerrar reproductor"
      viewportRatio={0.88}
    >
      <NowPlayingBody />
    </BottomSheet>
  );
}

function NowPlayingBody() {
  const {
    current,
    playing,
    buffering,
    currentTime,
    duration,
    shuffle,
    repeat,
    queue,
    index,
    playTracks,
    togglePlay,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleRepeat,
  } = useNowPlaying();
  const { isFavorite, toggleFavorite } = useFavorites();
  const cover = useCoverUrl(current?.coverId);
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const liked = current ? isFavorite(current.id) : false;

  if (!current) {
    return (
      <View style={styles.empty}>
        <Text style={type.pageTitle}>Silencio</Text>
        <Text style={type.body}>Elige una pista en la biblioteca para empezar.</Text>
      </View>
    );
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.coverWrap}>
        <Cover id={current.id} label={current.title} uri={cover} size={240} radius={8} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={type.body}>{current.artistName}</Text>
          <Text style={type.meta}>{current.albumName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? "Quitar de favoritos" : "Añadir a favoritos"}
          hitSlop={12}
          onPress={() => {
            triggerUiHaptic();
            void toggleFavorite(current);
          }}
          style={styles.heart}
        >
          <Heart color={liked ? colors.accent : colors.muted} fill={liked ? colors.accent : "transparent"} size={26} />
        </Pressable>
      </View>
      <SeekBar currentTime={currentTime} duration={duration} onSeek={(value) => void seek(value)} />
      <Text style={type.meta}>{buffering ? "Cargando…" : " "}</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            triggerUiHaptic();
            toggleShuffle();
          }}
          hitSlop={10}
        >
          <Shuffle color={shuffle ? colors.accent : colors.muted} size={22} />
        </Pressable>
        <Pressable onPress={() => void prev()} hitSlop={10}>
          <SkipBack color={colors.ink} size={28} fill={colors.ink} />
        </Pressable>
        <Pressable onPress={() => void togglePlay()} style={styles.play}>
          {playing ? (
            <Pause color={colors.accentText} size={28} fill={colors.accentText} />
          ) : (
            <Play color={colors.accentText} size={28} fill={colors.accentText} />
          )}
        </Pressable>
        <Pressable onPress={() => void next()} hitSlop={10}>
          <SkipForward color={colors.ink} size={28} fill={colors.ink} />
        </Pressable>
        <Pressable
          onPress={() => {
            triggerUiHaptic();
            cycleRepeat();
          }}
          hitSlop={10}
        >
          <RepeatIcon color={repeat === "off" ? colors.muted : colors.accent} size={22} />
        </Pressable>
      </View>
      <View style={styles.queue}>
        <Text style={type.label}>Cola</Text>
        {!queue.length ? <Text style={type.body}>La cola está vacía.</Text> : null}
        {queue.map((track, i) => (
          <TrackRow
            key={`${track.id}-${i}`}
            track={track}
            index={i + 1}
            active={current.id === track.id && i === index}
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
    gap: 14,
  },
  empty: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 8,
    justifyContent: "center",
  },
  coverWrap: { alignItems: "center", paddingTop: 4, paddingBottom: 8 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  meta: { flex: 1, gap: 4 },
  heart: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  play: {
    width: 68,
    height: 68,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  queue: { gap: 4, paddingTop: 4 },
});
