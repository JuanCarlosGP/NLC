import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronLeft,
  CircleMinus,
  CirclePlus,
  Heart,
  Image as ImageIcon,
  Link2,
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
import { rememberTrackArtwork, withTrackArtwork } from "@/lib/library/artwork-cache";
import { findCoverForTrack } from "@/lib/library/fetch-track-cover";
import {
  applyTrackCoverUrl,
  isYoutubeUrl,
  renameTrackFile,
  replaceTrackAudio,
} from "@/lib/library/track-file-edit";
import { usePlayer } from "@/lib/player/player-context";
import { useDownloadSettings } from "@/lib/podcasts/download-settings-context";
import { useTrackActions, type TrackActionsTarget } from "@/lib/player/track-actions-context";
import { useSettings } from "@/lib/settings/settings-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { useI18n } from "@/lib/i18n/context";
import { triggerSelectionUiHaptic, triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

type ViewMode = "menu" | "playlists" | "source";

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
  const { playlists, addTracksToPlaylist, createLocalPlaylist, removeTrackFromPlaylist, updateTrackCover } = useSpotify();
  const { source, settings, password } = useSettings();
  const download = useDownloadSettings();
  const [view, setView] = useState<ViewMode>("menu");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverStatus, setCoverStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [fileId, setFileId] = useState(track.id);
  const [titleDraft, setTitleDraft] = useState(track.title);
  const [coverDraft, setCoverDraft] = useState("");
  const [detailState, setDetailState] = useState<"idle" | "saving" | "saved">("idle");
  const [detailError, setDetailError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceState, setSourceState] = useState<"idle" | "running">("idle");
  const [sourceError, setSourceError] = useState("");
  const live = useMemo(
    () => ({ ...track, id: fileId, title: titleDraft.trim() || track.title }),
    [track, fileId, titleDraft],
  );
  const liked = isFavorite(fileId);
  const canDelete = Boolean(source.deleteTrack && fileId.startsWith("/"));
  const canEditFile = fileId.startsWith("/");

  useEffect(() => {
    setView("menu");
    setName("");
    setCoverStatus("idle");
    setFileId(track.id);
    setTitleDraft(track.title);
    setCoverDraft("");
    setDetailState("idle");
    setDetailError("");
    setSourceUrl("");
    setSourceState("idle");
    setSourceError("");
  }, [track.id, playlistId]);

  async function handleFindCover() {
    if (coverStatus === "searching") return;
    triggerUiHaptic();
    setCoverStatus("searching");
    try {
      const playlist = playlistId ? playlists.find((p) => p.id === playlistId) : null;
      const playlistTrack = playlist?.tracks.find(
        (t) => t.matched?.id === fileId || t.spotifyId === fileId,
      );
      const spotifyId = playlistTrack?.spotifyId;

      const foundUrl = await findCoverForTrack({
        title: live.title,
        artistName: track.artistName,
        albumName: track.albumName,
        spotifyId,
      });

      if (foundUrl) {
        await rememberTrackArtwork([{ trackId: fileId, url: foundUrl }]);
        if (source.ensureCoverSidecar && fileId.startsWith("/")) {
          void source.ensureCoverSidecar(fileId, foundUrl).catch(() => {});
        }
        void updateTrackCover(fileId, foundUrl);
        triggerSelectionUiHaptic();
        setCoverStatus("found");
        setTimeout(() => {
          setCoverStatus("idle");
        }, 2500);
      } else {
        triggerUiHaptic();
        setCoverStatus("not_found");
        setTimeout(() => {
          setCoverStatus("idle");
        }, 2500);
      }
    } catch {
      setCoverStatus("not_found");
      setTimeout(() => {
        setCoverStatus("idle");
      }, 2500);
    }
  }

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
      await addTracksToPlaylist(id, [live]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function createList() {
    const title = name.trim() || display.title;
    setBusy(true);
    try {
      await createLocalPlaylist(title, [live]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    const title = titleDraft.trim();
    const coverUrl = coverDraft.trim();
    if (!title) {
      setDetailError(t("player.nameEmpty"));
      return;
    }
    if (!canEditFile || (!coverUrl && title === track.title && fileId === track.id)) return;
    setDetailState("saving");
    setDetailError("");
    try {
      let nextId = fileId;
      if (title !== track.title || fileId !== track.id) {
        nextId = await renameTrackFile(settings, password, fileId, title);
        setFileId(nextId);
      }
      if (coverUrl) {
        await applyTrackCoverUrl(settings, password, nextId, coverUrl);
        void updateTrackCover(nextId, coverUrl);
        setCoverDraft("");
      }
      setDetailState("saved");
    } catch (err) {
      setDetailState("idle");
      setDetailError(err instanceof Error ? err.message : t("player.sourceFail"));
    }
  }

  async function replaceSource() {
    if (sourceState === "running") return;
    if (!isYoutubeUrl(sourceUrl)) {
      setSourceError(t("player.sourceBadUrl"));
      return;
    }
    setSourceState("running");
    setSourceError("");
    try {
      const nextId = await replaceTrackAudio({
        trackId: fileId,
        youtubeUrl: sourceUrl,
        nas: settings,
        password,
        download: download.settings,
        token: download.token,
      });
      setFileId(nextId);
      setSourceState("idle");
      setSourceUrl("");
      onClose();
    } catch (err) {
      setSourceState("idle");
      setSourceError(err instanceof Error ? err.message : t("player.sourceFail"));
    }
  }

  async function onDelete() {
    if (!source.deleteTrack) return;
    setBusy(true);
    try {
      await source.deleteTrack(fileId);
      await Promise.all([removeFavorite(fileId), removeRecent(fileId), clearLibraryCache(fileId)]);
      await removeTrackFromQueue(fileId);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/ya no existe|not found|404/i.test(message)) {
        await Promise.all([removeFavorite(fileId), removeRecent(fileId), clearLibraryCache(fileId)]);
        await removeTrackFromQueue(fileId);
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
          <Cover id={fileId} label={live.title} uri={cover} size={48} radius={4} />
          <View style={styles.headerMeta}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {live.title}
            </Text>
            <Text numberOfLines={1} style={styles.headerSub}>
              {display.artistName}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        {view === "source" ? (
          <>
            <ActionRow
              icon={<ChevronLeft color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("onboarding.back")}
              onPress={() => {
                triggerUiHaptic();
                setView("menu");
              }}
            />
            <Text style={styles.hint}>{t("player.sourceHint")}</Text>
            <Text style={styles.fieldLabel}>{t("player.sourceUrl")}</Text>
            <TextInput
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://youtu.be/…"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.field}
            />
            <Pressable
              disabled={sourceState === "running"}
              onPress={() => {
                triggerUiHaptic();
                void replaceSource();
              }}
              style={({ pressed }) => [
                styles.saveBtn,
                { opacity: pressed || sourceState === "running" ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.createBtnText}>
                {sourceState === "running" ? t("player.replacingAudio") : t("player.replaceAudio")}
              </Text>
            </Pressable>
            {sourceError ? <Text style={styles.error}>{sourceError}</Text> : null}
          </>
        ) : view === "playlists" ? (
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
            {canEditFile ? (
              <View style={styles.fields}>
                <Text style={styles.fieldLabel}>{t("player.songName")}</Text>
                <TextInput
                  value={titleDraft}
                  onChangeText={(value) => {
                    setTitleDraft(value);
                    setDetailState("idle");
                  }}
                  placeholder={t("player.songName")}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.accent}
                  style={styles.field}
                />
                <Text style={styles.fieldLabel}>{t("player.coverUrl")}</Text>
                <TextInput
                  value={coverDraft}
                  onChangeText={(value) => {
                    setCoverDraft(value);
                    setDetailState("idle");
                  }}
                  placeholder={t("player.coverUrlPlaceholder")}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.accent}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.field}
                />
                <Pressable
                  disabled={detailState === "saving"}
                  onPress={() => {
                    triggerUiHaptic();
                    void saveDetails();
                  }}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    { opacity: pressed || detailState === "saving" ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.createBtnText}>
                    {detailState === "saving"
                      ? t("player.savingDetails")
                      : detailState === "saved"
                        ? t("player.detailsSaved")
                        : t("player.saveDetails")}
                  </Text>
                </Pressable>
                {detailError ? <Text style={styles.error}>{detailError}</Text> : null}
              </View>
            ) : null}
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
                  closeAfter(() => removeTrackFromPlaylist(playlistId, fileId))
                }
              />
            ) : null}
            <ActionRow
              icon={<ListEnd color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.addQueue")}
              onPress={() => closeAfter(() => enqueueTracks([live], "end"))}
            />
            <ActionRow
              icon={<ListPlus color={colors.ink} size={22} strokeWidth={1.8} />}
              label={t("player.playNext")}
              onPress={() => closeAfter(() => enqueueTracks([live], "next"))}
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
              onPress={() => closeAfter(() => toggleFavorite({ ...track, id: fileId }))}
            />
            {canEditFile ? (
              <ActionRow
                icon={<Link2 color={colors.ink} size={22} strokeWidth={1.8} />}
                label={t("player.changeSource")}
                onPress={() => {
                  triggerUiHaptic();
                  setView("source");
                }}
              />
            ) : null}
            <ActionRow
              icon={
                coverStatus === "searching" ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : coverStatus === "found" ? (
                  <Check color={colors.ok} size={22} strokeWidth={2.2} />
                ) : (
                  <ImageIcon
                    color={coverStatus === "not_found" ? colors.muted : colors.ink}
                    size={22}
                    strokeWidth={1.8}
                  />
                )
              }
              label={
                coverStatus === "searching"
                  ? t("player.findingCover")
                  : coverStatus === "found"
                    ? t("player.coverFound")
                    : coverStatus === "not_found"
                      ? t("player.coverNotFound")
                      : t("player.findCover")
              }
              disabled={coverStatus === "searching"}
              onPress={() => void handleFindCover()}
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
  fields: {
    gap: 8,
    paddingBottom: 12,
  },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
  field: {
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
  saveBtn: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    paddingBottom: 12,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.danger,
    paddingTop: 8,
  },
  createBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accentText,
  },
});
