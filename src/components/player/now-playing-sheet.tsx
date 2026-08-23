import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { TrackRow } from "@/components/library/track-row";
import { Cover } from "@/components/ui/cover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SeekBar } from "@/components/player/seek-bar";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { useNowPlaying } from "@/hooks/use-now-playing";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { clearLibraryCache, removeRecent } from "@/lib/library/cache";
import { useDock } from "@/lib/dock-context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { useSettings } from "@/lib/settings/settings-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function NowPlayingSheet() {
  const { nowPlayingOpen, setNowPlayingOpen } = usePlayerUi();
  const dock = useDock();

  return (
    <BottomSheet
      open={nowPlayingOpen}
      onOpenChange={(open) => {
        setNowPlayingOpen(open);
        if (!open) dock?.reveal();
      }}
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
    removeTrackFromQueue,
  } = useNowPlaying();
  const { isFavorite, toggleFavorite, removeFavorite } = useFavorites();
  const { source } = useSettings();
  const { setNowPlayingOpen } = usePlayerUi();
  const cover = useTrackArtwork(current);
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const liked = current ? isFavorite(current.id) : false;
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const canDelete = Boolean(source.deleteTrack && current?.id.startsWith("/"));

  async function onDelete() {
    if (!current || !source.deleteTrack || deleting) return;
    triggerUiHaptic();
    setDeleting(true);
    setFeedback(null);
    const trackId = current.id;
    const willEmpty = queue.every((track) => track.id === trackId);
    try {
      await source.deleteTrack(trackId);
      await Promise.all([removeFavorite(trackId), removeRecent(trackId), clearLibraryCache(trackId)]);
      setConfirmOpen(false);
      await removeTrackFromQueue(trackId);
      setFeedback("Eliminado.");
      if (willEmpty) setNowPlayingOpen(false);
    } catch (err) {
      // File already missing: still purge local lists.
      const message = err instanceof Error ? err.message : "";
      if (/ya no existe|not found|404/i.test(message)) {
        await Promise.all([removeFavorite(trackId), removeRecent(trackId), clearLibraryCache(trackId)]);
        setConfirmOpen(false);
        await removeTrackFromQueue(trackId);
        setFeedback("Quitado (ya no estaba en el NAS).");
        if (willEmpty) setNowPlayingOpen(false);
      } else {
        setFeedback(err instanceof Error ? err.message : "No se pudo eliminar.");
      }
    } finally {
      setDeleting(false);
    }
  }

  function onCoverLongPress() {
    if (!canDelete || deleting) return;
    triggerUiHaptic();
    setConfirmOpen(true);
  }

  if (!current) {
    return (
      <View style={styles.empty}>
        <Text style={type.pageTitle}>Silencio</Text>
        <Text style={type.body}>Elige una pista en la biblioteca para empezar.</Text>
      </View>
    );
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.coverWrap}>
          <View style={styles.coverFrame}>
            <Pressable
              accessibilityLabel={canDelete ? "Mantén pulsado para eliminar del NAS" : undefined}
              delayLongPress={450}
              disabled={deleting || !canDelete}
              onLongPress={onCoverLongPress}
              style={({ pressed }) => [deleting && styles.btnDisabled, { opacity: pressed ? 0.92 : 1 }]}
            >
              <Cover id={current.id} label={current.title} uri={cover} size={240} radius={8} />
            </Pressable>
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
              <Heart
                color={liked ? colors.accent : colors.ink}
                fill={liked ? colors.accent : "transparent"}
                size={22}
              />
            </Pressable>
          </View>
        </View>
        <View style={styles.meta}>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={type.body}>{current.artistName}</Text>
          <Text style={type.meta}>{current.albumName}</Text>
          {feedback ? (
            <Text style={[type.meta, feedback.startsWith("Eliminado") ? styles.ok : styles.err]}>
              {feedback}
            </Text>
          ) : null}
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

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar del NAS"
        message={`¿Borrar «${current.title}»?\nSe eliminará el archivo y no se puede deshacer.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={() => void onDelete()}
      />
    </>
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
  coverWrap: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
    width: "100%",
  },
  coverFrame: {
    width: 240,
    height: 240,
    position: "relative",
  },
  meta: { gap: 4 },
  heart: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12, 16, 14, 0.55)",
  },
  btnDisabled: { opacity: 0.45 },
  ok: { color: colors.ok },
  err: { color: colors.danger },
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
