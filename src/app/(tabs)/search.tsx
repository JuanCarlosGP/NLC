import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AlbumRow } from "@/components/library/album-row";
import { ArtistRow } from "@/components/library/artist-row";
import { TrackRow } from "@/components/library/track-row";
import { TaskRow, taskListStyle } from "@/components/productivity/task-row";
import { AccountActivitySheet } from "@/components/wealth/account-activity-sheet";
import { AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { GoalComposerSheet } from "@/components/wealth/goal-composer-sheet";
import { GoalRow, goalListStyle } from "@/components/wealth/goal-row";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { Screen } from "@/components/ui/screen";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { albumHref, artistHref, projectHref, taskHref } from "@/lib/library/href";
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
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import { colors, fonts, type } from "@/lib/theme";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { assetPosition } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import {
  ACCOUNT_KIND_LABEL,
  ASSET_KIND_LABEL,
  TX_KIND_LABEL,
  type WealthAccount,
  type WealthAsset,
  type WealthGoal,
} from "@/lib/wealth/types";
import { useI18n } from "@/lib/i18n/context";
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
  const { t } = useI18n();
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
      <Text style={type.pageTitle}>{t("search.title")}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={podcast ? t("search.placeholderPodcast") : t("search.placeholderMusic")}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>{t("common.searching")}</Text> : null}
      {empty ? <Text style={type.body}>{t("search.emptyIndex", { query: query.trim() })}</Text> : null}

      {artists.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("search.artists")}</Text>
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
          <Text style={type.sectionTitle}>{podcast ? t("search.podcasts") : t("search.albums")}</Text>
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
  const { t } = useI18n();
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
        setError(err instanceof Error ? err.message : t("search.videoError"));
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
      <Text style={type.pageTitle}>{t("search.title")}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("search.placeholderVideo")}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>{t("common.searching")}</Text> : null}
      {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
      {!loading && q && !visible.length ? (
        <Text style={type.body}>{t("search.emptyQuery", { query: query.trim() })}</Text>
      ) : null}
      {series.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("search.series")}</Text>
          <View style={seriesListStyle}>
            {series.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle={t("search.seriesKind")}
                onPress={() => openShow(show)}
              />
            ))}
          </View>
        </View>
      ) : null}
      {movies.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("search.movies")}</Text>
          <View style={seriesListStyle}>
            {movies.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle={t("search.movieKind")}
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

function hay(q: string, ...parts: Array<string | null | undefined>): boolean {
  if (!q) return true;
  return parts.some((part) => Boolean(part && part.toLowerCase().includes(q)));
}

function WealthSearch() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const { txs, assets, liveAccounts, goalProgress, totalOf } = useWealth();
  const [preview, setPreview] = useState<WealthAccount | null>(null);
  const [editingAsset, setEditingAsset] = useState<WealthAsset | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<WealthGoal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const q = query.trim().toLowerCase();

  const matchedAccounts = useMemo(
    () =>
      liveAccounts.filter((account) =>
        hay(q, account.name, ACCOUNT_KIND_LABEL[account.kind], "cuenta", "efectivo", "account", "cash"),
      ),
    [liveAccounts, q],
  );
  const matchedAssets = useMemo(() => {
    const live = assets.filter((asset) => !asset.archived).map(assetPosition);
    return live.filter((position) => {
      const account = liveAccounts.find((item) => item.id === position.asset.accountId)?.name;
      return hay(
        q,
        position.asset.name,
        position.asset.ticker,
        ASSET_KIND_LABEL[position.asset.kind],
        account,
        "inversion",
        "inversión",
        "investment",
      );
    });
  }, [assets, liveAccounts, q]);
  const matchedGoals = useMemo(
    () =>
      goalProgress.filter((item) =>
        hay(q, item.goal.name, item.scopeLabel, "objetivo", "goal"),
      ),
    [goalProgress, q],
  );
  const matchedTx = useMemo(() => {
    const chronological = [...txs].sort((a, b) => b.bookedAt - a.bookedAt || b.createdAt - a.createdAt);
    return chronological.filter((tx) => {
      const account = liveAccounts.find((item) => item.id === tx.accountId)?.name ?? "";
      const counter = liveAccounts.find((item) => item.id === tx.counterAccountId)?.name ?? "";
      const asset = assets.find((item) => item.id === tx.assetId);
      return hay(
        q,
        tx.title,
        tx.category,
        tx.notes,
        account,
        counter,
        TX_KIND_LABEL[tx.kind],
        asset?.name,
        asset?.ticker,
      );
    });
  }, [assets, liveAccounts, q, txs]);

  const empty =
    Boolean(q) &&
    !matchedAccounts.length &&
    !matchedAssets.length &&
    !matchedGoals.length &&
    !matchedTx.length;

  return (
    <>
      <Screen>
        <Text style={type.pageTitle}>{t("search.title")}</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("search.placeholderWealth")}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={styles.input}
        />
        {empty ? <Text style={type.body}>{t("search.emptyQuery", { query: query.trim() })}</Text> : null}

        {matchedAccounts.length ? (
          <View style={styles.block}>
            <Text style={type.sectionTitle}>{t("search.accounts")}</Text>
            {matchedAccounts.map((account) => (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityLabel={`${account.name}, ${formatEuro(totalOf(account.id))}`}
                onPress={() => {
                  triggerUiHaptic();
                  setPreview(account);
                }}
                style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.72 : 1 }]}
              >
                <View>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={type.meta}>{ACCOUNT_KIND_LABEL[account.kind]}</Text>
                </View>
                <Text style={styles.accountBal}>{formatEuro(totalOf(account.id))}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {matchedAssets.length ? (
          <View style={styles.block}>
            <Text style={type.sectionTitle}>{t("search.assets")}</Text>
            <View style={assetListStyle}>
              {matchedAssets.map((position) => (
                <AssetRow
                  key={position.asset.id}
                  position={position}
                  onPress={() => {
                    triggerUiHaptic();
                    setEditingAsset(position.asset);
                    setAssetOpen(true);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {matchedGoals.length ? (
          <View style={styles.block}>
            <Text style={type.sectionTitle}>{t("search.goals")}</Text>
            <View style={goalListStyle}>
              {matchedGoals.map((item) => (
                <GoalRow
                  key={item.goal.id}
                  progress={item}
                  onPress={() => {
                    triggerUiHaptic();
                    setEditingGoal(item.goal);
                    setGoalOpen(true);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {matchedTx.length ? (
          <View style={styles.block}>
            <Text style={type.sectionTitle}>{t("search.txs")}</Text>
            <View style={txListStyle}>
              {matchedTx.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
      <AccountActivitySheet
        account={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        onEditAsset={(asset) => {
          if (!preview) return;
          triggerUiHaptic();
          setEditingAsset(asset);
          setAssetOpen(true);
        }}
      />
      <AssetComposerSheet
        open={assetOpen}
        asset={editingAsset}
        defaultAccountId={editingAsset?.accountId ?? preview?.id ?? null}
        onOpenChange={(open) => {
          setAssetOpen(open);
          if (!open) setEditingAsset(null);
        }}
      />
      <GoalComposerSheet
        open={goalOpen}
        goal={editingGoal}
        onOpenChange={(open) => {
          setGoalOpen(open);
          if (!open) setEditingGoal(null);
        }}
      />
    </>
  );
}

function FocusSearch() {
  const router = useRouter();
  const { t } = useI18n();
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
      <Text style={type.pageTitle}>{t("search.title")}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("search.placeholderFocus")}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {empty ? <Text style={type.body}>{t("search.emptyQuery", { query: query.trim() })}</Text> : null}
      {matchedProjects.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("search.projects")}</Text>
          <View style={seriesListStyle}>
            {matchedProjects.map((project) => (
              <SeriesRow
                key={project.id}
                title={project.name}
                subtitle={t("search.projectKind")}
                onPress={() => router.push(projectHref(project.id))}
              />
            ))}
          </View>
        </View>
      ) : null}
      {matchedTasks.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("search.tasks")}</Text>
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
  block: { gap: 4, paddingTop: 8 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  accountName: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  accountBal: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
});
