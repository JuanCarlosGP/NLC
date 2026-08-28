import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TrackRow } from "@/components/library/track-row";
import { Cover } from "@/components/ui/cover";
import { Screen } from "@/components/ui/screen";
import { artistHref, libraryParamId } from "@/lib/library/href";
import { useAlbum } from "@/hooks/use-album";
import { useExitingList } from "@/hooks/use-exiting-list";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { isPodcastAlbum } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";

export default function AlbumScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = libraryParamId(rawId);
  const router = useRouter();
  const { t } = useI18n();
  const { album, loading, error } = useAlbum(id);
  const { playTracks, current } = usePlayer();
  const albumTracks = album?.tracks ?? [];
  const { items: visibleTracks, isExiting } = useExitingList(albumTracks);
  const podcast = album ? isPodcastAlbum(album) : false;
  const cover = useCoverUrl(album?.coverId);

  return (
    <Screen>
      {loading ? <Text style={type.meta}>{t("album.loading")}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {album ? (
        <>
          <View style={styles.header}>
            <Cover id={album.id} label={album.name} uri={cover} size={160} radius={4} />
            <Text style={type.pageTitle}>{album.name}</Text>
            {podcast ? (
              <Text style={type.body}>{t("album.podcast")}</Text>
            ) : (
              <Pressable onPress={() => router.push(artistHref(album.artistId))}>
                <Text style={type.body}>{album.artistName}</Text>
              </Pressable>
            )}
            <Text style={type.meta}>
              {album.year ? `${album.year} · ` : ""}
              {t(
                podcast
                  ? album.tracks.length === 1
                    ? "album.episodeOne"
                    : "album.episodeMany"
                  : album.tracks.length === 1
                    ? "album.trackOne"
                    : "album.trackMany",
                { count: album.tracks.length },
              )}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void playTracks(album.tracks, 0)}
              style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.solidText}>{t("common.play")}</Text>
            </Pressable>
            <Pressable
              onPress={() => void playTracks(album.tracks, Math.floor(Math.random() * album.tracks.length))}
              style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.ghostText}>{t("common.shuffle")}</Text>
            </Pressable>
          </View>
          {visibleTracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={track.track ?? index + 1}
              active={current?.id === track.id}
              exiting={isExiting(track.id)}
              onPress={() => {
                if (isExiting(track.id)) return;
                const playIndex = album.tracks.findIndex((item) => item.id === track.id);
                if (playIndex < 0) return;
                void playTracks(album.tracks, playIndex);
              }}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.body, color: colors.danger },
  header: { gap: 8, paddingBottom: 8 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8 },
  solid: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet },
  solidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  ghostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
});
