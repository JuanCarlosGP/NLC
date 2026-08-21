import { useEffect } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ImportedEntityView } from "@/components/library/imported-entity";
import { Screen } from "@/components/ui/screen";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { type } from "@/lib/theme";

export default function ImportedPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
      <Screen scroll={false}>
        <Text style={type.meta}>Cargando playlist…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ImportedEntityView
        playlist={playlist}
        onToggleLiked={() => {
          void togglePlaylistLiked(playlist.id);
        }}
        onDelete={() => {
          void deletePlaylist(playlist.id).then(() => {
            if (router.canGoBack()) router.back();
            else router.replace("/library");
          });
        }}
      />
    </Screen>
  );
}
