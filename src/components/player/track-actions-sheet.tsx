import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  CircleMinus,
  CirclePlus,
  Heart,
  ListEnd,
  ListMusic,
  ListPlus,
  Trash2,
  User,
} from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Cover } from "@/components/ui/cover";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { clearLibraryCache, removeRecent } from "@/lib/library/cache";
import { artistHref } from "@/lib/library/href";
import { withTrackArtwork } from "@/lib/library/artwork-cache";
import { usePlayer } from "@/lib/player/player-context";
import { useTrackActions, type TrackActionsTarget } from "@/lib/player/track-actions-context";
import { useSettings } from "@/lib/settings/settings-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

type ViewMode = "menu" | "playlists";

export function TrackActionsSheet() {
  const { open, target, setOpen } = useTrackActions();
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      accessibilityCloseLabel={t("sheet.close")}
      viewportRatio={0.72}
    >
      {target ? <TrackActionsBody target={target} onClose={() => setOpen(false)} /> : null}
    </BottomSheet>
  );
}

function TrackActionsBody({
  target,
  onClose,
}: {
  target: TrackActionsTarget;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { track, playlistId } = target;
  const router = useRouter();
  const cover = useTrackArtwork(track);
  const display = withTrackArtwork(track);
  const { enqueueTracks, removeTrackFromQueue } = usePlayer();
  const { isFavorite, toggleFavorite, removeFavorite } = useFavorites();
  const { playlists, addTracksToPlaylist, createLocalPlaylist, removeTrackFromPlaylist } = useSpotify();
  const { source } = useSettings();
  const [view, setView] = useState<ViewMode>("menu");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const liked = isFavorite(track.id);
  const canDelete = Boolean(source.deleteTrack && track.id.startsWith("/"));

  useEffect(() => {
    setView("menu");
    setName("");
  }, [track.id, playlistId]);

  const lists = useMemo(
    () => playlists.filter((item) => item.kind !== "album" && item.id !== playlistId),
    [playlists, playlistId],
  );

  function closeAfter(action: () => unknown) {
    triggerUiHaptic();
    void Promise.resolve(action()).then(onClose);
  }

  async function addToList(id: string) {
    setBusy(true);
    try {
      await addTracksToPlaylist(id, [track]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function createList() {
    const title = name.trim() || display.title;
    setBusy(true);
    try {
      await createLocalPlaylist(title, [track]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!source.deleteTrack) return;
    setBusy(true);
    try {
      await source.deleteTrack(track.id);
      await Promise.all([removeFavorite(track.id), removeRecent(track.id), clearLibraryCache(track.id)]);
      await removeTrackFromQueue(track.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/ya no existe|not found|404/i.test(message)) {
        await Promise.all([removeFavorite(track.id), removeRecent(track.id), clearLibraryCache(track.id)]);
        await removeTrackFromQueue(track.id);
        setConfirmDelete(false);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Cover id={track.id} label={track.title} uri={cover} size={48} radius={4} />
          <View style={styles.headerMeta}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {display.title}
            </Text>
            <Text numberOfLines={1} style={styles.headerSub}>
              {display.artistName}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        {view === "playlists" ? (
          <>
            <ActionRow
              icon={<ChevronLeft color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("onboarding.back")}
              onPress={() => {
                triggerUiHaptic();
                setView("menu");
              }}
            />
            <Text style={styles.section}>{t("player.newPlaylist")}</Text>
            <View style={styles.create}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("player.playlistName")}
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={() => void createList()}
              />
              <Pressable
                disabled={busy}
                onPress={() => {
                  triggerUiHaptic();
                  void createList();
                }}
                style={({ pressed }) => [styles.createBtn, { opacity: pressed || busy ? 0.7 : 1 }]}
              >
                <Text style={styles.createBtnText}>{t("common.create")}</Text>
              </Pressable>
            </View>
            {lists.map((playlist) => (
              <ActionRow
                key={playlist.id}
                icon={<ListMusic color={colors.ink} size={22} strokeWidth={1.8} />}
                label={playlist.name}
                disabled={busy}
                onPress={() => {
                  triggerUiHaptic();
                  void addToList(playlist.id);
                }}
              />
            ))}
          </>
        ) : (
          <>
            <ActionRow
              icon={<CirclePlus color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.addToPlaylist")}
              onPress={() => {
                triggerUiHaptic();
                setView("playlists");
              }}
            />
            {playlistId ? (
              <ActionRow
                icon={<CircleMinus color={colors.ink} size={22} strokeWidth={1.8} />}
                label={t("player.removeFromPlaylist")}
                onPress={() =>
                  closeAfter(() => removeTrackFromPlaylist(playlistId, track.id))
                }
              />
            ) : null}
            <ActionRow
              icon={<ListEnd color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.addQueue")}
              onPress={() => closeAfter(() => enqueueTracks([track], "end"))}
            />
            <ActionRow
              icon={<ListPlus color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.playNext")}
              onPress={() => closeAfter(() => enqueueTracks([track], "next"))}
            />
            <ActionRow
              icon={<User color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.goArtist")}
              onPress={() =>
                closeAfter(() => {
                  router.push(artistHref(track.artistId));
                })
              }
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
              label={liked ? t("player.favoriteRemove") : t("player.favoriteAdd")}
              onPress={() => closeAfter(() => toggleFavorite(track))}
            />
            {canDelete ? (
              <ActionRow
                icon={<Trash2 color={colors.danger} size={22} strokeWidth={1.8} />}
                label={t("player.deleteNas")}
                danger
                onPress={() => {
                  triggerUiHaptic();
                  setConfirmDelete(true);
                }}
              />
            ) : null}
          </>
        )}
      </SheetScrollView>

      <ConfirmDialog
        open={confirmDelete}
        title={t("player.deleteNas")}
        message={t("player.deleteNasMessage")}
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
  section: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
    paddingTop: 4,
    paddingBottom: 8,
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
  create: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    paddingHorizontal: 12,
  },
  createBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accentText,
  },
});
