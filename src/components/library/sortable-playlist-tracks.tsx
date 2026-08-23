import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { CircleCheck, MoreVertical } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { useTrackActions } from "@/lib/player/track-actions-context";
import type { ImportedTrack } from "@/lib/spotify/types";
import { formatDurationMs } from "@/lib/spotify/txt";
import { triggerLongPressUiHaptic, triggerSelectionUiHaptic, triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

const ROW = 64;
const LONG_PRESS_MS = 280;
const EDGE = 88;
const SCROLL_STEP = 18;

export function SortablePlaylistTracks({
  tracks,
  playlistId,
  playlistCover: _playlistCover,
  currentId,
  scrollRef,
  scrollY,
  viewportTop,
  viewportHeight,
  maxScroll,
  scrollNative,
  onDragActiveChange,
  onPlay,
  onReorder,
  sortable = true,
}: {
  tracks: ImportedTrack[];
  playlistId: string;
  playlistCover: string | null;
  currentId?: string;
  scrollRef: { current: { scrollTo: (opts: { y: number; animated?: boolean }) => void } | null };
  scrollY: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  maxScroll: SharedValue<number>;
  scrollNative?: GestureType;
  onDragActiveChange: (active: boolean) => void;
  onPlay: (track: ImportedTrack) => void;
  onReorder: (from: number, to: number) => void;
  sortable?: boolean;
}) {
  const [items, setItems] = useState(tracks);
  const count = items.length;
  const activeIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const dragShift = useSharedValue(0);
  const scrollAtStart = useSharedValue(0);
  const edgeDir = useSharedValue(0);
  const draggingRef = useRef(false);
  const hoverRef = useRef(-1);
  const fromRef = useRef(-1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!draggingRef.current) setItems(tracks);
  }, [tracks]);

  useEffect(() => {
    return () => {
      draggingRef.current = false;
    };
  }, []);

  function setDragging(active: boolean) {
    draggingRef.current = active;
    onDragActiveChange(active);
    if (active) {
      triggerLongPressUiHaptic();
      const step = () => {
        if (!draggingRef.current) return;
        const dir = edgeDir.value;
        if (dir !== 0) {
          const next = Math.max(0, Math.min(maxScroll.value, scrollY.value + dir * SCROLL_STEP));
          scrollRef.current?.scrollTo({ y: next, animated: false });
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  function bumpHover(next: number) {
    if (hoverRef.current === next) return;
    hoverRef.current = next;
    triggerSelectionUiHaptic();
  }

  function finishDrag(fromIndex: number, toIndex = hoverRef.current) {
    if (fromRef.current !== fromIndex && activeIndex.value !== fromIndex) return;
    const from = fromIndex;
    const to = toIndex;
    draggingRef.current = false;
    onDragActiveChange(false);
    edgeDir.value = 0;
    activeIndex.value = -1;
    hoverIndex.value = -1;
    dragShift.value = 0;
    fromRef.current = -1;
    hoverRef.current = -1;
    if (from >= 0 && to >= 0 && from !== to) {
      const next = [...itemsRef.current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      setItems(next);
      onReorder(from, to);
    }
  }

  return (
    <View>
      {items.map((track, index) => (
        <SortableRow
          key={`${track.spotifyId}-${index}`}
          track={track}
          index={index}
          count={count}
          playlistId={playlistId}
          active={currentId === track.matched?.id}
          activeIndex={activeIndex}
          hoverIndex={hoverIndex}
          dragShift={dragShift}
          scrollY={scrollY}
          scrollAtStart={scrollAtStart}
          viewportTop={viewportTop}
          viewportHeight={viewportHeight}
          edgeDir={edgeDir}
          scrollNative={scrollNative}
          sortable={sortable}
          onPlay={() => onPlay(track)}
          onDragStart={(from) => {
            if (activeIndex.value !== from) return;
            fromRef.current = from;
            hoverRef.current = from;
            setDragging(true);
          }}
          onHover={bumpHover}
          onDragEnd={(to) => finishDrag(index, to)}
        />
      ))}
    </View>
  );
}

function SortableRow({
  track,
  index,
  count,
  playlistId,
  active,
  activeIndex,
  hoverIndex,
  dragShift,
  scrollY,
  scrollAtStart,
  viewportTop,
  viewportHeight,
  edgeDir,
  scrollNative,
  sortable,
  onPlay,
  onDragStart,
  onHover,
  onDragEnd,
}: {
  track: ImportedTrack;
  index: number;
  count: number;
  playlistId: string;
  active: boolean;
  activeIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  dragShift: SharedValue<number>;
  scrollY: SharedValue<number>;
  scrollAtStart: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  edgeDir: SharedValue<number>;
  scrollNative?: GestureType;
  sortable: boolean;
  onPlay: () => void;
  onDragStart: (index: number) => void;
  onHover: (index: number) => void;
  onDragEnd: (to: number) => void;
}) {
  const { openTrackActions } = useTrackActions();
  const local = track.matched;
  const coverUri = useTrackArtwork(
    local
      ? {
          id: local.id,
          albumId: local.albumId,
          albumName: local.albumName,
          artistName: local.artistName,
          coverId: local.coverId,
          artworkUrl: track.coverUrl || local.artworkUrl,
        }
      : { artworkUrl: track.coverUrl },
  );
  const [lifted, setLifted] = useState(false);

  const tap = Gesture.Tap()
    .enabled(Boolean(local))
    .onEnd(() => {
      runOnJS(onPlay)();
    });

  const panBase = Gesture.Pan()
    .enabled(sortable)
    .activateAfterLongPress(LONG_PRESS_MS)
    .maxPointers(1)
    .onStart(() => {
      "worklet";
      activeIndex.value = index;
      hoverIndex.value = index;
      scrollAtStart.value = scrollY.value;
      dragShift.value = 0;
      runOnJS(onDragStart)(index);
      runOnJS(setLifted)(true);
    })
    .onUpdate((event) => {
      "worklet";
      const adjust = scrollY.value - scrollAtStart.value;
      dragShift.value = event.translationY + adjust;
      const next = Math.max(
        0,
        Math.min(count - 1, index + Math.round(dragShift.value / ROW)),
      );
      if (next !== hoverIndex.value) {
        hoverIndex.value = next;
        runOnJS(onHover)(next);
      }
      const y = event.absoluteY;
      const top = viewportTop.value;
      const bottom = top + viewportHeight.value;
      if (y < top + EDGE) edgeDir.value = -1;
      else if (y > bottom - EDGE) edgeDir.value = 1;
      else edgeDir.value = 0;
    })
    .onFinalize(() => {
      "worklet";
      if (activeIndex.value !== index) return;
      const to = hoverIndex.value;
      edgeDir.value = 0;
      runOnJS(setLifted)(false);
      runOnJS(onDragEnd)(to);
    });
  const pan = scrollNative ? panBase.blocksExternalGesture(scrollNative) : panBase;

  const composed = Gesture.Exclusive(pan, tap);

  const rowStyle = useAnimatedStyle(() => {
    const from = activeIndex.value;
    const hover = hoverIndex.value;
    if (from === index) {
      return {
        zIndex: 20,
        transform: [{ translateY: dragShift.value }, { scale: 1.03 }],
      };
    }
    let shift = 0;
    if (from >= 0 && hover >= 0 && from !== hover) {
      if (from < hover && index > from && index <= hover) shift = -ROW;
      else if (from > hover && index >= hover && index < from) shift = ROW;
    }
    return {
      zIndex: 0,
      transform: [{ translateY: withTiming(shift, { duration: 140 }) }, { scale: 1 }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.rowWrap,
        rowStyle,
        lifted && styles.rowLifted,
        Platform.OS === "web" ? ({ userSelect: "none" } as object) : null,
      ]}
    >
      <View style={[styles.row, { opacity: local || lifted ? 1 : 0.55 }]}>
        <GestureDetector gesture={composed}>
          <View
            style={[
              styles.dragHit,
              Platform.OS === "web" ? ({ touchAction: "none" } as object) : null,
            ]}
          >
            <Cover id={track.spotifyId} label={track.title} uri={coverUri} size={48} radius={4} />
            <View style={styles.rowMeta}>
              <Text numberOfLines={1} style={[styles.title, active && styles.active]}>
                {track.title}
              </Text>
              <View style={styles.subRow}>
                {local ? <CircleCheck size={13} color={colors.void} fill={colors.ok} strokeWidth={2.4} /> : null}
                <Text numberOfLines={1} style={styles.sub}>
                  {track.artistName}
                </Text>
              </View>
            </View>
            <Text style={styles.duration}>{formatDurationMs(track.durationMs)}</Text>
          </View>
        </GestureDetector>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Más opciones"
          disabled={!local}
          hitSlop={10}
          onPress={() => {
            if (!local) return;
            triggerUiHaptic();
            openTrackActions(local, { playlistId });
          }}
          style={[styles.moreBtn, { opacity: local ? 1 : 0.35 }]}
        >
          <MoreVertical color={colors.ink} size={20} strokeWidth={2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    backgroundColor: colors.void,
  },
  rowLifted: {
    backgroundColor: colors.sheetRaised,
    borderRadius: 10,
    ...Platform.select({
      web: { boxShadow: "0 10px 28px rgba(0,0,0,0.45)" } as object,
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    minHeight: ROW,
  },
  dragHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowMeta: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  active: { color: colors.accent },
  subRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  sub: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  duration: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    minWidth: 36,
    textAlign: "right",
  },
  moreBtn: {
    width: 22,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
