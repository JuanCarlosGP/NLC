import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AlbumRow } from "@/components/library/album-row";
import { ArtistRow } from "@/components/library/artist-row";
import { TrackRow } from "@/components/library/track-row";
import { TaskRow, taskListStyle } from "@/components/productivity/task-row";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { GoalRow, goalListStyle } from "@/components/wealth/goal-row";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { Screen } from "@/components/ui/screen";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { albumHref, artistHref, assetHref, projectHref, taskHref } from "@/lib/library/href";
import { useExitingList } from "@/hooks/use-exiting-list";
import { useSearch } from "@/hooks/use-search";
import { isPodcastAlbum, isPodcastArtist, isPodcastTrack } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import { browseRoute } from "@/lib/video/browse";
import { listVideoShows, type VideoShow } from "@/lib/video/catalog";
import { watchRoute } from "@/lib/video/onepiece";
import { useActiveProjects, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { useWealth } from "@/lib/wealth/wealth-context";
import { assetPosition } from "@/lib/wealth/compute";
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import { colors, fonts, type } from "@/lib/theme";
import { useZone } from "@/lib/zone/zone-context";

export default function SearchScreen() {
  const { zone } = useZone();
  if (zone === "focus") return <FocusSearch />;
  if (zone === "wealth") return <WealthSearch />;
  if (zone === "video") return <VideoSearch />;
  return <CatalogSearch zone={zone} />;
}

function CatalogSearch({ zone }: { zone: "music" | "podcast" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, loading } = useSearch(query);
  const { playTracks } = usePlayer();
  const podcast = zone === "podcast";

  const artists = useMemo(
    () => results.artists.filter((artist) => (podcast ? isPodcastArtist(artist) : !isPodcastArtist(artist))),
    [podcast, results.artists],
  );
  const albums = useMemo(
    () => results.albums.filter((album) => (podcast ? isPodcastAlbum(album) : !isPodcastAlbum(album))),
    [podcast, results.albums],
  );
  const tracks = useMemo(
    () => results.tracks.filter((track) => (podcast ? isPodcastTrack(track) : !isPodcastTrack(track))),
    [podcast, results.tracks],
  );
  const { items: visibleTracks, isExiting } = useExitingList(tracks);

  const empty =
    !artists.length && !albums.length && !tracks.length && !loading && Boolean(query.trim());

  return (
    <Screen>
      <Text style={type.pageTitle}>Buscar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={podcast ? "Episodio o podcast" : "Artista, álbum o pista"}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>Buscando…</Text> : null}
      {empty ? <Text style={type.body}>Nada en el índice para «{query.trim()}».</Text> : null}

      {artists.length ? (
        <View>
          <Text style={type.sectionTitle}>Artistas</Text>
          {artists.map((artist) => (
            <ArtistRow
              key={artist.id}
              artist={artist}
              onPress={() => router.push(artistHref(artist.id))}
            />
          ))}
        </View>
      ) : null}

      {albums.length ? (
        <View>
          <Text style={type.sectionTitle}>{podcast ? "Podcasts" : "Álbumes"}</Text>
          {albums.map((album) => (
            <AlbumRow key={album.id} album={album} onPress={() => router.push(albumHref(album.id))} />
          ))}
        </View>
      ) : null}

      {visibleTracks.length ? (
        <View>
          {visibleTracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index + 1}
              exiting={isExiting(track.id)}
              onPress={() => {
                if (isExiting(track.id)) return;
                const playIndex = tracks.findIndex((item) => item.id === track.id);
                if (playIndex < 0) return;
                void playTracks(tracks, playIndex);
              }}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function VideoSearch() {
  const router = useRouter();
  const { settings, password, ready } = useSettings();
  const [query, setQuery] = useState("");
  const [shows, setShows] = useState<VideoShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listVideoShows(settings, password)
      .then((next) => {
        if (!cancelled) setShows(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo buscar en el vídeo.");
        setShows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [password, ready, settings]);

  const q = query.trim().toLowerCase();
  const visible = q ? shows.filter((show) => show.title.toLowerCase().includes(q)) : shows;
  const series = visible.filter((show) => show.kind === "series");
  const movies = visible.filter((show) => show.kind === "movie");

  function openShow(show: VideoShow) {
    if (show.kind === "movie" && show.file) {
      const parent = show.path.replace(/\/[^/]+$/, "") || show.path;
      router.push(watchRoute(show.path, parent));
      return;
    }
    router.push(browseRoute(show.path));
  }

  return (
    <Screen>
      <Text style={type.pageTitle}>Buscar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Serie o película"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>Buscando…</Text> : null}
      {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
      {!loading && q && !visible.length ? (
        <Text style={type.body}>Nada para «{query.trim()}».</Text>
      ) : null}
      {series.length ? (
        <View>
          <Text style={type.sectionTitle}>Series</Text>
          <View style={seriesListStyle}>
            {series.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle="Serie"
                onPress={() => openShow(show)}
              />
            ))}
          </View>
        </View>
      ) : null}
      {movies.length ? (
        <View>
          <Text style={type.sectionTitle}>Películas</Text>
          <View style={seriesListStyle}>
            {movies.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle="Película"
                playable={show.file}
                onPress={() => openShow(show)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function WealthSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { assets, txs, accounts, goalProgress } = useWealth();
  const q = query.trim().toLowerCase();

  const matchedAssets = useMemo(() => {
    const live = assets.filter((asset) => !asset.archived);
    if (!q) return live;
    return live.filter(
      (asset) => asset.name.toLowerCase().includes(q) || asset.ticker.toLowerCase().includes(q),
    );
  }, [assets, q]);
  const matchedTx = useMemo(() => {
    if (!q) return txs;
    return txs.filter(
      (tx) =>
        tx.title.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.notes.toLowerCase().includes(q),
    );
  }, [q, txs]);
  const matchedAccounts = useMemo(() => {
    const live = accounts.filter((account) => !account.archived);
    if (!q) return live;
    return live.filter((account) => account.name.toLowerCase().includes(q));
  }, [accounts, q]);
  const matchedGoals = useMemo(() => {
    if (!q) return goalProgress;
    return goalProgress.filter((item) => item.goal.name.toLowerCase().includes(q));
  }, [goalProgress, q]);
  const empty =
    Boolean(q) &&
    !matchedAssets.length &&
    !matchedTx.length &&
    !matchedAccounts.length &&
    !matchedGoals.length;

  return (
    <Screen>
      <Text style={type.pageTitle}>Buscar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Inversión, movimiento, cuenta u objetivo"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {empty ? <Text style={type.body}>Nada para «{query.trim()}».</Text> : null}
      {matchedGoals.length ? (
        <View>
          <Text style={type.sectionTitle}>Objetivos</Text>
          <View style={goalListStyle}>
            {matchedGoals.map((item) => (
              <GoalRow
                key={item.goal.id}
                progress={item}
                onPress={() => router.push("/wealth/goals")}
              />
            ))}
          </View>
        </View>
      ) : null}
      {matchedAccounts.length ? (
        <View>
          <Text style={type.sectionTitle}>Cuentas</Text>
          {matchedAccounts.map((account) => (
            <SeriesRow
              key={account.id}
              title={account.name}
              subtitle="Cuenta"
              onPress={() => router.push("/wealth/accounts")}
            />
          ))}
        </View>
      ) : null}
      {matchedAssets.length ? (
        <View>
          <Text style={type.sectionTitle}>Inversiones</Text>
          <View style={assetListStyle}>
            {matchedAssets.map((asset) => (
              <AssetRow
                key={asset.id}
                position={assetPosition(asset)}
                onPress={() => router.push(assetHref(asset.id))}
              />
            ))}
          </View>
        </View>
      ) : null}
      {matchedTx.length ? (
        <View>
          <Text style={type.sectionTitle}>Movimientos</Text>
          <View style={txListStyle}>
            {matchedTx.map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function FocusSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const projects = useActiveProjects();
  const tasks = useVisibleTasks();
  const { openTaskActions } = useTaskActions();
  const q = query.trim().toLowerCase();

  const matchedTasks = useMemo(
    () =>
      q
        ? tasks.filter(
            (task) =>
              task.title.toLowerCase().includes(q) || task.notes.toLowerCase().includes(q),
          )
        : tasks,
    [q, tasks],
  );
  const matchedProjects = useMemo(
    () => (q ? projects.filter((project) => project.name.toLowerCase().includes(q)) : projects),
    [projects, q],
  );
  const empty = Boolean(q) && !matchedTasks.length && !matchedProjects.length;

  return (
    <Screen>
      <Text style={type.pageTitle}>Buscar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Tarea o proyecto"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {empty ? <Text style={type.body}>Nada para «{query.trim()}».</Text> : null}
      {matchedProjects.length ? (
        <View>
          <Text style={type.sectionTitle}>Proyectos</Text>
          <View style={seriesListStyle}>
            {matchedProjects.map((project) => (
              <SeriesRow
                key={project.id}
                title={project.name}
                subtitle="Proyecto"
                onPress={() => router.push(projectHref(project.id))}
              />
            ))}
          </View>
        </View>
      ) : null}
      {matchedTasks.length ? (
        <View>
          <Text style={type.sectionTitle}>Tareas</Text>
          <View style={taskListStyle}>
            {matchedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                project={projects.find((project) => project.id === task.projectId)}
                onPress={() => router.push(taskHref(task.id))}
                onLongPress={() => openTaskActions(task)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
