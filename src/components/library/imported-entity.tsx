import { useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowDownCircle,
  Check,
  CircleCheck,
  EllipsisVertical,
  Globe,
  Pause,
  Play,
  Share2,
  Shuffle,
  Trash2,
} from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { TintWash } from "@/components/ui/tint-wash";
import { usePlayer } from "@/lib/player/player-context";
import { matchedNasTracks } from "@/lib/spotify/match";
import { formatPlaylistDuration, shareTracksTxt } from "@/lib/spotify/txt";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, coverTint, fonts, layout } from "@/lib/theme";

const PAGE = 20;
const COVER = 200;

export function ImportedEntityView({
  playlist,
  onDelete,
}: {
  playlist: ImportedPlaylist;
  onDelete?: () => void;
}) {
  const { playTracks, current, playing, togglePlay, shuffle, toggleShuffle } = usePlayer();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [visible, setVisible] = useState(PAGE);
  const [exporting, setExporting] = useState(false);
  const playable = matchedNasTracks(playlist.tracks);
  const selectedTracks = useMemo(
    () => playlist.tracks.filter((track) => selected.has(track.spotifyId)),
    [playlist.tracks, selected],
  );
  const exportTracks = selectedTracks.length ? selectedTracks : playlist.tracks;
  const playSelection = selectedTracks.length ? matchedNasTracks(selectedTracks) : playable;
  const allSelected = selected.size === playlist.tracks.length && playlist.tracks.length > 0;
  const selectMode = selected.size > 0;
  const totalMs = useMemo(
    () => playlist.tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0),
    [playlist.tracks],
  );
  const playingHere = Boolean(current && playable.some((track) => track.id === current.id));
  const tint = coverTint(playlist.id);

  function toggle(id: string) {
    setSelected((currentSelected) => {
      const next = new Set(currentSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(playlist.tracks.map((track) => track.spotifyId)));
  }

  function playFrom(index = 0) {
    if (!playSelection.length) return;
    void playTracks(playSelection, index);
  }

  function onMainPlay() {
    triggerUiHaptic();
    if (playingHere) {
      void togglePlay();
      return;
    }
    playFrom(0);
  }

  return (
    <View style={styles.wrap}>
      <TintWash id={playlist.id} from={tint} to={colors.void} style={styles.wash} />

      <View style={styles.coverWrap}>
        <View style={styles.coverShadow}>
          <Cover id={playlist.id} label={playlist.name} uri={playlist.coverUrl} size={COVER} radius={6} />
        </View>
      </View>

      <Text style={styles.name}>{playlist.name}</Text>

      <View style={styles.ownerRow}>
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <Text style={styles.avatarText}>{(playlist.ownerName.trim()[0] ?? "·").toUpperCase()}</Text>
        </View>
        <Text style={styles.owner}>{playlist.ownerName}</Text>
      </View>

      <View style={styles.metaRow}>
        <Globe size={13} color={colors.muted} strokeWidth={2} />
        <Text style={styles.meta}>
          {[
            formatPlaylistDuration(totalMs),
            `${playlist.tracks.length} temas`,
            `${playable.length} en NAS`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.actionLeft}>
          <Cover id={`${playlist.id}-mini`} label={playlist.name} uri={playlist.coverUrl} size={28} radius={3} />
          <View
            accessibilityLabel={playable.length ? `${playable.length} en NAS` : "Nada en NAS"}
            style={styles.iconBtn}
          >
            <ArrowDownCircle size={24} color={playable.length ? colors.ok : colors.muted} strokeWidth={1.75} />
          </View>
          <IconButton
            label="Exportar TXT"
            disabled={exporting}
            onPress={() => {
              setExporting(true);
              void shareTracksTxt(playlist.name, exportTracks).finally(() => setExporting(false));
            }}
          >
            <Share2 size={22} color={colors.inkSoft} strokeWidth={1.75} />
          </IconButton>
        </View>
        <View style={styles.actionRight}>
          <IconButton label={shuffle ? "Desactivar aleatorio" : "Aleatorio"} onPress={toggleShuffle}>
            <Shuffle size={22} color={shuffle ? colors.accent : colors.inkSoft} strokeWidth={1.75} />
          </IconButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playingHere && playing ? "Pausar" : "Reproducir"}
            disabled={!playSelection.length && !playingHere}
            onPress={onMainPlay}
            style={({ pressed }) => [
              styles.play,
              { opacity: !playSelection.length && !playingHere ? 0.4 : pressed ? 0.86 : 1 },
            ]}
          >
            {playingHere && playing ? (
              <Pause color={colors.accentText} size={28} fill={colors.accentText} />
            ) : (
              <View style={styles.playIcon}>
                <Play color={colors.accentText} size={28} fill={colors.accentText} />
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.pillsScroll}
        contentContainerStyle={styles.pills}
      >
        <Pill label={allSelected ? "Nada" : "Todo"} onPress={toggleAll} />
        <Pill
          label={exporting ? "…" : "TXT"}
          onPress={() => {
            setExporting(true);
            void shareTracksTxt(playlist.name, exportTracks).finally(() => setExporting(false));
          }}
        />
        {onDelete ? <Pill label="Quitar" danger onPress={onDelete} icon={<Trash2 size={14} color={colors.danger} />} /> : null}
        {selectMode ? <Text style={styles.selCount}>{selected.size} sel.</Text> : null}
      </ScrollView>

      {playlist.tracks.slice(0, visible).map((track) => {
        const local = track.matched;
        return (
          <PlaylistTrackRow
            key={track.spotifyId}
            track={track}
            playlistCover={playlist.kind === "album" ? null : playlist.coverUrl}
            active={current?.id === local?.id}
            selected={selected.has(track.spotifyId)}
            onPress={() => {
              if (selectMode || !local) {
                toggle(track.spotifyId);
                return;
              }
              void playTracks(
                playable,
                Math.max(
                  0,
                  playable.findIndex((item) => item.id === local.id),
                ),
              );
            }}
            onToggle={() => toggle(track.spotifyId)}
          />
        );
      })}

      {visible < playlist.tracks.length ? (
        <Pressable
          onPress={() => setVisible((count) => count + PAGE)}
          style={({ pressed }) => [styles.more, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.moreText}>Mostrar más ({playlist.tracks.length - visible} restantes)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PlaylistTrackRow({
  track,
  playlistCover,
  active,
  selected,
  onPress,
  onToggle,
}: {
  track: ImportedTrack;
  playlistCover: string | null;
  active: boolean;
  selected: boolean;
  onPress: () => void;
  onToggle: () => void;
}) {
  const local = track.matched;
  const coverUri = playlistCover && track.coverUrl === playlistCover ? null : track.coverUrl;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onToggle}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.82 : local ? 1 : 0.55 }]}
    >
      <View style={styles.thumb}>
        <Cover id={track.spotifyId} label={track.title} uri={coverUri} size={48} radius={4} />
        {selected ? (
          <View style={styles.thumbCheck}>
            <Check size={16} color={colors.accentText} strokeWidth={3} />
          </View>
        ) : null}
      </View>
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
      <IconButton label={selected ? "Quitar selección" : "Seleccionar"} onPress={onToggle}>
        <EllipsisVertical size={20} color={colors.muted} strokeWidth={1.75} />
      </IconButton>
    </Pressable>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        triggerUiHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function Pill({
  label,
  icon,
  danger,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        triggerUiHaptic();
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.8 : 1 }]}
    >
      {icon}
      <Text style={[styles.pillText, danger && styles.pillDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, position: "relative" },
  wash: {
    position: "absolute",
    top: -24,
    left: -layout.screenPad,
    right: -layout.screenPad,
    height: 520,
  },
  coverWrap: { alignItems: "center", paddingTop: 22, paddingBottom: 10 },
  coverShadow: {
    borderRadius: 6,
    ...Platform.select({
      web: { boxShadow: "0 18px 44px rgba(0,0,0,0.55)" } as object,
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.5,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  name: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.ink },
  owner: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, flex: 1 },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 2,
  },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  actionRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { marginLeft: 3 },
  pillsScroll: {
    marginHorizontal: -layout.screenPad,
    flexGrow: 0,
  },
  pills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: layout.screenPad,
    paddingVertical: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.sheetRaised,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
  pillDanger: { color: colors.danger },
  selCount: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, paddingHorizontal: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  thumb: { width: 48, height: 48 },
  thumbCheck: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
    backgroundColor: "rgba(14,13,12,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMeta: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  active: { color: colors.accent },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sub: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  more: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    marginTop: 4,
  },
  moreText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
});
