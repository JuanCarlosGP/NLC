import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ImportedEntityView } from "@/components/library/imported-entity";
import { useImportedSheet } from "@/lib/spotify/imported-sheet-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { colors } from "@/lib/theme";

export function ImportedPlaylistSheet() {
  const { playlistId, closeImported } = useImportedSheet();
  const { playlists, deletePlaylist, hydratePlaylistCovers } = useSpotify();
  const playlist = playlists.find((item) => item.id === playlistId) ?? null;

  useEffect(() => {
    if (playlist) void hydratePlaylistCovers(playlist);
  }, [hydratePlaylistCovers, playlist]);

  useEffect(() => {
    if (playlistId && !playlist) closeImported();
  }, [closeImported, playlist, playlistId]);

  return (
    <BottomSheet
      open={Boolean(playlistId)}
      onOpenChange={(open) => {
        if (!open) closeImported();
      }}
      accessibilityCloseLabel="Cerrar playlist"
      sheetBackgroundColor={colors.void}
      viewportRatio={0.92}
    >
      {playlist ? (
        <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <ImportedEntityView
            playlist={playlist}
            onDelete={() => {
              void deletePlaylist(playlist.id).then(() => closeImported());
            }}
          />
        </SheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
});
