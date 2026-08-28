import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart, ListEnd, ListMusic, ListPlus, Play, RefreshCw, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Cover } from "@/components/ui/cover";
import { usePlayer } from "@/lib/player/player-context";
import { matchedNasTracks } from "@/lib/spotify/match";
import { usePlaylistActions } from "@/lib/spotify/playlist-actions-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts } from "@/lib/theme";

export function PlaylistActionsSheet() {
  const { open, playlist, setOpen } = usePlaylistActions();
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      accessibilityCloseLabel={t("playlistActions.closeSheet")}
      viewportRatio={0.5}
      expandable
      expandedRatio={0.88}
    >
      {playlist ? <PlaylistActionsBody playlist={playlist} onClose={() => setOpen(false)} /> : null}
    </BottomSheet>
  );
}

function PlaylistActionsBody({
  playlist,
  onClose,
}: {
  playlist: ImportedPlaylist;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { playTracks, enqueueTracks } = usePlayer();
  const { deletePlaylist, rematchPlaylist, togglePlaylistLiked } = useSpotify();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const playable = matchedNasTracks(playlist.tracks);
  const liked = Boolean(playlist.liked);
  const canRematch = playlist.kind !== "local";
  const kindLabel = playlist.kind === "album" ? t("playlistActions.album") : t("playlistActions.playlist");
  const trackCountLabel = t(
    playlist.tracks.length === 1 ? "playlistActions.trackOne" : "playlistActions.trackMany",
    { count: playlist.tracks.length },
  );

  function closeAfter(action: () => unknown) {
    triggerUiHaptic();
    void Promise.resolve(action()).then(onClose);
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deletePlaylist(playlist.id);
      setConfirmDelete(false);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Cover id={playlist.id} label={playlist.name} uri={playlist.coverUrl} size={48} radius={4} />
          <View style={styles.headerMeta}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {playlist.name}
            </Text>
            <Text numberOfLines={1} style={styles.headerSub}>
              {[kindLabel, playlist.ownerName, trackCountLabel].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        <ActionRow
          icon={<ListMusic color={colors.ink} size={22} strokeWidth={1.8} />}
          label={t("playlistActions.view")}
          onPress={() =>
            closeAfter(() => {
              router.push(`/imported/${playlist.id}`);
            })
          }
        />
        <ActionRow
          icon={<Play color={colors.ink} size={22} fill={colors.ink} strokeWidth={1.8} />}
          label={t("playlistActions.play")}
          disabled={!playable.length}
          onPress={() => closeAfter(() => playTracks(playable, 0))}
        />
        <ActionRow
          icon={<ListPlus color={colors.ink} size={22} strokeWidth={1.8} />}
          label={t("playlistActions.playNext")}
          disabled={!playable.length}
          onPress={() => closeAfter(() => enqueueTracks(playable, "next"))}
        />
        <ActionRow
          icon={<ListEnd color={colors.ink} size={22} strokeWidth={1.8} />}
          label={t("playlistActions.queue")}
          disabled={!playable.length}
          onPress={() => closeAfter(() => enqueueTracks(playable, "end"))}
        />
        <ActionRow
          icon={
            <Heart
              color={liked ? colors.accent : colors.ink}
              fill={liked ? colors.accent : "transparent"}
              size={22}
              strokeWidth={1.8}
            />
          }
          label={liked ? t("importedEntity.removeHome") : t("importedEntity.addHome")}
          onPress={() => closeAfter(() => togglePlaylistLiked(playlist.id))}
        />
        {canRematch ? (
          <ActionRow
            icon={<RefreshCw color={colors.ink} size={22} strokeWidth={1.8} />}
            label={t("playlistActions.rematch")}
            onPress={() => closeAfter(() => rematchPlaylist(playlist.id))}
          />
        ) : null}
        <ActionRow
          icon={<Trash2 color={colors.danger} size={22} strokeWidth={1.8} />}
          label={t("playlistActions.delete")}
          danger
          onPress={() => {
            triggerUiHaptic();
            setConfirmDelete(true);
          }}
        />
      </SheetScrollView>

      <ConfirmDialog
        open={confirmDelete}
        title={t("playlistActions.delete")}
        message={t("playlistActions.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}

function ActionRow({
  icon,
  label,
  danger,
  disabled,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.4 : pressed ? 0.72 : 1 }]}
    >
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 16,
  },
  headerMeta: { flex: 1, gap: 3 },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.ink,
  },
  headerSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginBottom: 8,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  icon: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  labelDanger: {
    color: colors.danger,
  },
});
