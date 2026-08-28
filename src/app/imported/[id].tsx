import { useEffect } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ImportedEntityView } from "@/components/library/imported-entity";
import { Screen } from "@/components/ui/screen";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { useI18n } from "@/lib/i18n/context";
import { layout, type } from "@/lib/theme";

export default function ImportedPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { playlists, deletePlaylist, hydratePlaylistCovers, togglePlaylistLiked } = useSpotify();
  const playlist = playlists.find((item) => item.id === id) ?? null;

  useEffect(() => {
    if (playlist) void hydratePlaylistCovers(playlist);
  }, [hydratePlaylistCovers, playlist]);

  useEffect(() => {
    if (id && !playlist) {
      if (router.canGoBack()) router.back();
      else router.replace("/library");
    }
  }, [id, playlist, router]);

  if (!playlist) {
    return (
      <Screen scroll={false} flush>
        <Text style={[type.meta, { paddingHorizontal: layout.screenPad, paddingTop: 12 }]}>
          {t("imported.loading")}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} flush>
      <ImportedEntityView
        playlist={playlist}
        onToggleLiked={() => {
          void togglePlaylistLiked(playlist.id);
        }}
        onDelete={async () => {
          await deletePlaylist(playlist.id);
          if (router.canGoBack()) router.back();
          else router.replace("/library");
        }}
      />
    </Screen>
  );
}
