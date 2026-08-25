import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useSharedValue } from "react-native-reanimated";
import {
  ArrowDownCircle,
  CircleCheck,
  Heart,
  Globe,
  Pause,
  Play,
  Search,
  Shuffle,
  Trash2,
  X,
} from "lucide-react-native";
import { SortablePlaylistTracks } from "@/components/library/sortable-playlist-tracks";
import { Cover } from "@/components/ui/cover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TintWash } from "@/components/ui/tint-wash";
import { mergeDockOnScroll, useDock } from "@/lib/dock-context";
import { useDownloadSettings } from "@/hooks/use-download-settings";
import { usePlayer } from "@/lib/player/player-context";
import {
  downloadSearchQuery,
  enqueueSearchDownload,
  checkDownloaderHealth,
  waitForDownloadJob,
} from "@/lib/podcasts/downloader";
import { matchedNasTracks } from "@/lib/spotify/match";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { formatPlaylistDuration } from "@/lib/spotify/txt";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { usePlaylistActions } from "@/lib/spotify/playlist-actions-context";
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
  onDelete?: () => void | Promise<void>;
  onToggleLiked?: () => void;
}) {
  const { playTracks, current, playing, togglePlay, shuffle, toggleShuffle } = usePlayer();
  const { settings, token, ready: downloadReady } = useDownloadSettings();
  const { rematchPlaylist, reorderPlaylistTracks } = useSpotify();
  const { openPlaylistActions } = usePlaylistActions();
  const dock = useDock();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollY = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const maxScroll = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const scrollNative = useMemo(() => Gesture.Native(), []);
  const [visible, setVisible] = useState(PAGE);
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);
  const focusSearch = () => searchRef.current?.focus();
  const searchTap = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        runOnJS(focusSearch)();
      }),
    [],
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
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

  const local = playlist.kind === "local";

  // Re-link after NAS downloads / previous broken matches.
  useEffect(() => {
    if (local || !missing.length) {
      rematchTried.current = null;
      return;
    }
    if (rematchTried.current === playlist.id) return;
    rematchTried.current = playlist.id;
    void rematchPlaylist(playlist.id);
  }, [local, missing.length, playlist.id, rematchPlaylist]);
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

  const searching = Boolean(query.trim());
  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return playlist.tracks;
    return playlist.tracks.filter((track) => {
      const blob = `${track.title} ${track.artistName} ${track.albumName}`.toLowerCase();
      return tokens.every((token) => blob.includes(token));
    });
  }, [playlist.tracks, query]);
  const shown = searching ? filtered : filtered.slice(0, visible);

  function commitReorder(from: number, to: number) {
    if (searching || from === to) return;
    const nextShown = [...shown];
    const [moved] = nextShown.splice(from, 1);
    if (!moved) return;
    nextShown.splice(to, 0, moved);
    void reorderPlaylistTracks(playlist.id, [...nextShown, ...playlist.tracks.slice(visible)]);
  }

  return (
    <View style={styles.page}>
    <TintWash
      id={playlist.id}
      from={tint}
      to={colors.void}
      style={[styles.wash, { height: insets.top + 560 }]}
    />
    <GestureDetector gesture={scrollNative}>
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingTop: insets.top + 8 }]}
      scrollEnabled={!dragging}
      keyboardShouldPersistTaps="always"
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      onScroll={mergeDockOnScroll(dock, (event) => {
        scrollY.value = event.nativeEvent.contentOffset.y;
      })}
      onLayout={(event) => {
        viewportHeight.value = event.nativeEvent.layout.height;
        const node = scrollRef.current as unknown as {
          measureInWindow?: (callback: (x: number, y: number) => void) => void;
        } | null;
        node?.measureInWindow?.((_x, y) => {
          viewportTop.value = y;
        });
      }}
      onContentSizeChange={(_w, height) => {
        maxScroll.value = Math.max(0, height - viewportHeight.value);
      }}
    >
    <View style={styles.wrap}>
      <GestureDetector gesture={searchTap}>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Buscar canciones"
        onPress={focusSearch}
        style={styles.searchBox}
      >
        <Search size={16} color={colors.muted} strokeWidth={2} />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar canciones"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          showSoftInputOnFocus
          style={styles.searchInput}
        />
        {searching ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
            hitSlop={8}
            onPress={() => setQuery("")}
          >
            <X size={16} color={colors.inkSoft} strokeWidth={2} />
          </Pressable>
        ) : null}
      </Pressable>
      </GestureDetector>
      <View style={styles.coverWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Opciones de la playlist"
          delayLongPress={350}
          onLongPress={() => openPlaylistActions(playlist)}
          style={styles.coverShadow}
        >
          <Cover id={playlist.id} label={playlist.name} uri={playlist.coverUrl} size={COVER} radius={6} />
        </Pressable>
      </View>

      <Text style={styles.name}>{playlist.name}</Text>

      <View style={styles.metaRow}>
        <Globe size={13} color={colors.muted} strokeWidth={2} />
        <Text style={styles.meta}>
          {[
            formatPlaylistDuration(totalMs),
            `${playlist.tracks.length} temas`,
            local ? "NAS" : `${playable.length} en NAS`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.actionLeft}>
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
            <IconButton
              label="Quitar playlist"
              onPress={() => setConfirmRemove(true)}
            >
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

      {searching && !filtered.length ? (
        <Text style={styles.fetchNote}>Nada en esta playlist para «{query.trim()}».</Text>
      ) : null}

      <SortablePlaylistTracks
        tracks={shown}
        playlistId={playlist.id}
        playlistCover={playlist.kind === "album" ? null : playlist.coverUrl}
        currentId={current?.id}
        scrollRef={scrollRef}
        scrollY={scrollY}
        viewportTop={viewportTop}
        viewportHeight={viewportHeight}
        maxScroll={maxScroll}
        sortable={!searching}
        onDragActiveChange={setDragging}
        onPlay={(track) => {
          const local = track.matched;
          if (!local) return;
          void playTracks(
            playable,
            Math.max(
              0,
              playable.findIndex((item) => item.id === local.id),
            ),
          );
        }}
        scrollNative={scrollNative}
        onReorder={commitReorder}
      />

      {!searching && visible < playlist.tracks.length ? (
        <Pressable
          onPress={() => setVisible((count) => count + PAGE)}
          style={({ pressed }) => [styles.more, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.moreText}>Mostrar más ({playlist.tracks.length - visible} restantes)</Text>
        </Pressable>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Eliminar playlist"
        message={`Se quitará «${playlist.name}» de la biblioteca. Los archivos del NAS no se borran.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        busy={removing}
        onCancel={() => {
          if (!removing) setConfirmRemove(false);
        }}
        onConfirm={() => {
          if (!onDelete || removing) return;
          setRemoving(true);
          void Promise.resolve(onDelete()).finally(() => {
            setRemoving(false);
            setConfirmRemove(false);
          });
        }}
      />

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
    </Animated.ScrollView>
    </GestureDetector>
    </View>
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
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { flexGrow: 1, paddingBottom: 8, paddingHorizontal: layout.screenPad },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      web: { boxShadow: "0 10px 28px rgba(0,0,0,0.35)" } as object,
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    padding: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  wrap: { gap: 10, position: "relative" },
  wash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 560,
    zIndex: 0,
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
