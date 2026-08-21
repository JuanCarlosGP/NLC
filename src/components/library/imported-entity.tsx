import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ArrowDownCircle,
  CircleCheck,
  Heart,
  Globe,
  Pause,
  Play,
  Shuffle,
  Trash2,
} from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TintWash } from "@/components/ui/tint-wash";
import { useDownloadSettings } from "@/hooks/use-download-settings";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { usePlayer } from "@/lib/player/player-context";
import {
  downloadSearchQuery,
  enqueueSearchDownload,
  checkDownloaderHealth,
  waitForDownloadJob,
} from "@/lib/podcasts/downloader";
import { matchedNasTracks } from "@/lib/spotify/match";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { formatDurationMs, formatPlaylistDuration } from "@/lib/spotify/txt";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, coverTint, fonts, layout } from "@/lib/theme";

const PAGE = 20;
const COVER = 200;

export function ImportedEntityView({
  playlist,
  onDelete,
  onToggleLiked,
}: {
  playlist: ImportedPlaylist;
  onDelete?: () => void;
  onToggleLiked?: () => void;
}) {
  const { playTracks, current, playing, togglePlay, shuffle, toggleShuffle } = usePlayer();
  const { settings, token, ready: downloadReady } = useDownloadSettings();
  const { rematchPlaylist } = useSpotify();
  const [visible, setVisible] = useState(PAGE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const playable = matchedNasTracks(playlist.tracks);
  const missing = useMemo(
    () => playlist.tracks.filter((track) => !track.matched),
    [playlist.tracks],
  );
  const nasStats = useMemo(() => {
    const inMobile = playlist.tracks.length;
    const onNas = playlist.tracks.filter((track) => Boolean(track.matched)).length;
    const offTime = playlist.tracks.filter((track) => {
      const local = track.matched;
      if (!local) return true;
      if (!track.durationMs || !local.durationMs) return false;
      return Math.abs(track.durationMs - local.durationMs) > 3000;
    });
    const exact = offTime.length === 0 && onNas === inMobile && inMobile > 0;
    const offTitles = offTime.map((track) => track.title);
    const offLabel =
      offTitles.length <= 4
        ? offTitles.join(", ")
        : `${offTitles.slice(0, 4).join(", ")} y ${offTitles.length - 4} más`;
    return { inMobile, onNas, exact, offLabel, offCount: offTime.length };
  }, [playlist.tracks]);
  const rematchTried = useRef<string | null>(null);

  // Re-link after NAS downloads / previous broken matches.
  useEffect(() => {
    if (!missing.length) {
      rematchTried.current = null;
      return;
    }
    if (rematchTried.current === playlist.id) return;
    rematchTried.current = playlist.id;
    void rematchPlaylist(playlist.id);
  }, [missing.length, playlist.id, rematchPlaylist]);
  const liked = Boolean(playlist.liked);
  const totalMs = useMemo(
    () => playlist.tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0),
    [playlist.tracks],
  );
  const playingHere = Boolean(current && playable.some((track) => track.id === current.id));
  const tint = coverTint(playlist.id);
  const nasLabel = missing.length
    ? `Descargar ${missing.length} con yt-dlp`
    : playable.length
      ? `${playable.length} en NAS`
      : "Nada en NAS";
  const nasColor = missing.length
    ? colors.accent
    : playable.length
      ? colors.ok
      : colors.muted;

  function playFrom(index = 0) {
    if (!playable.length) return;
    void playTracks(playable, index);
  }

  function onMainPlay() {
    triggerUiHaptic();
    if (playingHere) {
      void togglePlay();
      return;
    }
    playFrom(0);
  }

  function onNasPress() {
    if (!missing.length) {
      setInfoOpen(true);
      return;
    }
    if (!downloadReady) {
      setFetchNote("Configura yt-dlp en Ajustes.");
      return;
    }
    setConfirmSuccess(false);
    setConfirmOpen(true);
  }

  async function runNasFetch() {
    if (!missing.length || fetching) return;
    setFetching(true);
    setFetchNote(null);
    const queue = [...missing];

    try {
      await checkDownloaderHealth(settings, token);
    } catch (err) {
      setFetchNote(err instanceof Error ? err.message : "No se pudo conectar al downloader.");
      setFetching(false);
      return;
    }

    setConfirmSuccess(true);
    await new Promise((resolve) => setTimeout(resolve, 520));
    setConfirmOpen(false);
    setConfirmSuccess(false);

    void (async () => {
      let done = 0;
      let failed = 0;
      try {
        for (const track of queue) {
          const query = downloadSearchQuery(track.title, track.artistName);
          setFetchNote(`${done + failed + 1}/${queue.length}: ${query}`);
          const created = await enqueueSearchDownload(
            settings,
            token,
            query,
            "song",
            track.durationMs || null,
          );
          const finalJob = await waitForDownloadJob(settings, token, created.id, (job) => {
            setFetchNote(
              `${done + failed + 1}/${queue.length} · ${job.title || query}${
                job.progress != null ? ` · ${Math.round(job.progress)}%` : ""
              }`,
            );
          });
          if (finalJob.status === "done") done += 1;
          else failed += 1;
        }
        setFetchNote(
          failed
            ? `Listo: ${done} descargadas, ${failed} con error. Rematcheando…`
            : `${done} descargadas. Rematcheando con el NAS…`,
        );
        await rematchPlaylist(playlist.id);
        setFetchNote(
          failed
            ? `Hecho: ${done} ok, ${failed} fallaron. Revisa Music/Canciones.`
            : `Hecho: ${done} en Music/Canciones. Coincidencias actualizadas.`,
        );
      } catch (err) {
        setFetchNote(err instanceof Error ? err.message : "No se pudo descargar.");
      } finally {
        setFetching(false);
      }
    })();
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
          <IconButton label={nasLabel} disabled={fetching} onPress={onNasPress}>
            {!missing.length && playable.length ? (
              <CircleCheck size={24} color={colors.ok} strokeWidth={1.75} />
            ) : (
              <ArrowDownCircle size={24} color={nasColor} strokeWidth={1.75} />
            )}
          </IconButton>
          <IconButton
            label={liked ? "Quitar de inicio" : "Añadir a inicio"}
            onPress={() => onToggleLiked?.()}
          >
            <Heart
              size={22}
              color={liked ? colors.accent : colors.inkSoft}
              fill={liked ? colors.accent : "transparent"}
              strokeWidth={1.75}
            />
          </IconButton>
          {onDelete ? (
            <IconButton label="Quitar playlist" onPress={onDelete}>
              <Trash2 size={20} color={colors.danger} strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </View>
        <View style={styles.actionRight}>
          <IconButton label={shuffle ? "Desactivar aleatorio" : "Aleatorio"} onPress={toggleShuffle}>
            <Shuffle size={22} color={shuffle ? colors.accent : colors.inkSoft} strokeWidth={1.75} />
          </IconButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playingHere && playing ? "Pausar" : "Reproducir"}
            disabled={!playable.length && !playingHere}
            onPress={onMainPlay}
            style={({ pressed }) => [
              styles.play,
              { opacity: !playable.length && !playingHere ? 0.4 : pressed ? 0.86 : 1 },
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

      {fetchNote ? <Text style={styles.fetchNote}>{fetchNote}</Text> : null}

      {playlist.tracks.slice(0, visible).map((track) => {
        const local = track.matched;
        return (
          <PlaylistTrackRow
            key={track.spotifyId}
            track={track}
            playlistCover={playlist.kind === "album" ? null : playlist.coverUrl}
            active={current?.id === local?.id}
            onPress={() => {
              if (!local) return;
              void playTracks(
                playable,
                Math.max(
                  0,
                  playable.findIndex((item) => item.id === local.id),
                ),
              );
            }}
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

      <ConfirmDialog
        open={confirmOpen}
        title="Descargar al NAS"
        message={`${missing.length} temas pendientes de descargar al NAS.`}
        confirmLabel="Descargar"
        cancelLabel="Cancelar"
        destructive={false}
        busy={fetching && confirmOpen && !confirmSuccess}
        success={confirmSuccess}
        onCancel={() => {
          if (!fetching && !confirmSuccess) setConfirmOpen(false);
        }}
        onConfirm={() => void runNasFetch()}
      />

      <ConfirmDialog
        open={infoOpen}
        title="Estado en el NAS"
        message={[
          `${nasStats.onNas} pistas en el NAS.`,
          `${nasStats.inMobile} pistas en el móvil.`,
          nasStats.exact
            ? "Coincidencia exacta en minutos con la playlist original."
            : nasStats.offCount
              ? `Sin tiempo exacto: ${nasStats.offLabel}.`
              : "No hay coincidencia exacta de minutos con la playlist original.",
        ].join("\n")}
        confirmLabel="Entendido"
        info
        destructive={false}
        onCancel={() => setInfoOpen(false)}
        onConfirm={() => setInfoOpen(false)}
      />
    </View>
  );
}

function PlaylistTrackRow({
  track,
  playlistCover,
  active,
  onPress,
}: {
  track: ImportedTrack;
  playlistCover: string | null;
  active: boolean;
  onPress: () => void;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const local = track.matched;
  const liked = local ? isFavorite(local.id) : false;
  const coverUri = playlistCover && track.coverUrl === playlistCover ? null : track.coverUrl;
  return (
    <Pressable
      onPress={onPress}
      disabled={!local}
      style={({ pressed }) => [styles.row, { opacity: pressed && local ? 0.82 : local ? 1 : 0.55 }]}
    >
      <View style={styles.thumb}>
        <Cover id={track.spotifyId} label={track.title} uri={coverUri} size={48} radius={4} />
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
      <Text style={styles.duration}>{formatDurationMs(track.durationMs)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? "Quitar de favoritos" : "Añadir a favoritos"}
        disabled={!local}
        hitSlop={10}
        onPress={() => {
          if (!local) return;
          triggerUiHaptic();
          void toggleFavorite(local);
        }}
        style={[styles.heart, { opacity: local ? 1 : 0.35 }]}
      >
        <Heart
          color={liked ? colors.accent : colors.muted}
          fill={liked ? colors.accent : "transparent"}
          size={16}
        />
      </Pressable>
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, flex: 1 },
  fetchNote: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  thumb: { width: 48, height: 48 },
  rowMeta: { flex: 1, gap: 3 },
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
  heart: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
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
