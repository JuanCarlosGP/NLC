import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Download, EyeOff, FolderOpen, Heart, Play, Smartphone, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getDownloadMeta, upsertVideoTracks } from "@/lib/db/catalog";
import { deleteWebDavFile } from "@/lib/nas/webdav-source";
import { downloadTrackIds, offlineSupported, removeOfflineFile } from "@/lib/offline/downloader";
import { useSettings } from "@/lib/settings/settings-context";
import { browseRoute, collectEpisodes, episodeLocation } from "@/lib/video/browse";
import {
  favoriteFromTarget,
  isVideoFavorite,
  loadVideoFavorites,
  toggleVideoFavorite,
} from "@/lib/video/favorites";
import { clearLastWatch, loadWatchHistory, peekWatchHistory, watchMatchesPath } from "@/lib/video/watch-history";
import { useVideoActions, type VideoActionsTarget } from "@/lib/video/video-actions-context";
import type { VideoEpisode } from "@/lib/video/types";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function VideoActionsSheet() {
  const { open, target, setOpen } = useVideoActions();
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      accessibilityCloseLabel={t("sheet.close")}
      viewportRatio={0.62}
    >
      {target ? <VideoActionsBody target={target} onClose={() => setOpen(false)} /> : null}
    </BottomSheet>
  );
}

function VideoActionsBody({
  target,
  onClose,
}: {
  target: VideoActionsTarget;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { settings, password } = useSettings();
  const { onChanged } = useVideoActions();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"download" | "delete" | "remove" | null>(null);
  const [episodes, setEpisodes] = useState<VideoEpisode[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [liked, setLiked] = useState(false);
  const meta = targetMeta(target, t);
  const canDownload = offlineSupported();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list =
        target.kind === "episode"
          ? [target.episode]
          : await collectEpisodes(settings, password, meta.path).catch(() => [] as VideoEpisode[]);
      if (cancelled) return;
      setEpisodes(list);
      const flags = await getDownloadMeta(list.map((item) => item.path));
      if (cancelled) return;
      setReadyCount(flags.filter((item) => item.offlineStatus === "ready").length);
      await Promise.all([loadWatchHistory(), loadVideoFavorites()]);
      if (cancelled) return;
      setCanContinue(peekWatchHistory().some((entry) => watchMatchesPath(entry, meta.path)));
      setLiked(isVideoFavorite(favoriteFromTarget(target).path));
    })();
    return () => {
      cancelled = true;
    };
  }, [meta.path, password, settings, target]);

  function closeAfter(action: () => unknown) {
    triggerUiHaptic();
    void Promise.resolve(action()).then(onClose);
  }

  async function download() {
    setBusy(true);
    try {
      await upsertVideoTracks(
        episodes.map((episode) => {
          const loc = episodeLocation(episode.path);
          return {
            path: episode.path,
            title: episode.title,
            number: episode.number,
            albumId: episode.arcPath,
            albumName: loc.arcTitle,
          };
        }),
      );
      await downloadTrackIds(episodes.map((episode) => episode.path));
      onChanged?.();
      setConfirm(null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function removeLocal() {
    setBusy(true);
    try {
      for (const episode of episodes) {
        await removeOfflineFile(episode.path);
      }
      onChanged?.();
      setConfirm(null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function removeNas() {
    setBusy(true);
    try {
      await deleteWebDavFile(settings, password, meta.path);
      await clearLastWatch(meta.path);
      onChanged?.();
      setConfirm(null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerMeta}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {meta.title}
            </Text>
            <Text numberOfLines={1} style={styles.headerSub}>
              {meta.subtitle}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        <ActionRow
          icon={
            target.kind === "episode" ? (
              <Play color={colors.ink} size={22} strokeWidth={1.8} />
            ) : (
              <FolderOpen color={colors.ink} size={22} strokeWidth={1.8} />
            )
          }
          label={target.kind === "episode" ? t("videoUi.watch") : t("videoUi.open")}
          onPress={() =>
            closeAfter(() => {
              if (target.kind === "folder") {
                router.push(browseRoute(target.path));
                return;
              }
              router.push({
                pathname: "/watch/[...path]",
                params: {
                  path: target.episode.path.replace(/^\//, "").split("/"),
                  arc: encodeURIComponent(target.episode.arcPath),
                  index: String(target.index),
                },
              });
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
          onPress={() =>
            closeAfter(async () => {
              await toggleVideoFavorite(favoriteFromTarget(target));
              onChanged?.();
            })
          }
        />
        {canDownload ? (
          <ActionRow
            icon={<Download color={colors.ink} size={22} strokeWidth={1.8} />}
            label={
              episodes.length > 1
                ? t("videoUi.downloadEpisodes", { count: episodes.length })
                : t("videoUi.downloadPhone")
            }
            disabled={busy || (episodes.length > 0 && readyCount === episodes.length)}
            onPress={() => {
              triggerUiHaptic();
              if (episodes.length > 1) setConfirm("download");
              else void download();
            }}
          />
        ) : null}
        {readyCount > 0 ? (
          <ActionRow
            icon={<Smartphone color={colors.ink} size={22} strokeWidth={1.8} />}
            label={
              readyCount > 1
                ? t("videoUi.removeEpisodes", { count: readyCount })
                : t("videoUi.removePhone")
            }
            onPress={() => {
              triggerUiHaptic();
              setConfirm("remove");
            }}
          />
        ) : null}
        {canContinue ? (
          <ActionRow
            icon={<EyeOff color={colors.ink} size={22} strokeWidth={1.8} />}
            label={t("videoUi.removeContinue")}
            onPress={() =>
              closeAfter(async () => {
                await clearLastWatch(meta.path);
                onChanged?.();
              })
            }
          />
        ) : null}
        <ActionRow
          icon={<Trash2 color={colors.danger} size={22} strokeWidth={1.8} />}
          label={t("videoUi.deleteNas")}
          danger
          onPress={() => {
            triggerUiHaptic();
            setConfirm("delete");
          }}
        />
      </SheetScrollView>

      <ConfirmDialog
        open={confirm === "download"}
        title={t("videoUi.downloadConfirmTitle")}
        message={t("videoUi.downloadConfirmMessage", { count: episodes.length, title: meta.title })}
        confirmLabel={t("videoUi.downloadPhone")}
        cancelLabel={t("common.cancel")}
        destructive={false}
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={() => void download()}
      />
      <ConfirmDialog
        open={confirm === "remove"}
        title={t("videoUi.removeConfirmTitle")}
        message={t("videoUi.removeConfirmMessage", { title: meta.title })}
        confirmLabel={t("common.remove")}
        cancelLabel={t("common.cancel")}
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={() => void removeLocal()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={t("videoUi.deleteNas")}
        message={
          episodes.length > 1
            ? t("videoUi.deleteConfirmEpisodes", { count: episodes.length, title: meta.title })
            : t("videoUi.deleteConfirmOne", { title: meta.title })
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={() => void removeNas()}
      />
    </>
  );
}

function targetMeta(
  target: VideoActionsTarget,
  t: (path: string, vars?: Record<string, string | number>) => string,
): { title: string; subtitle: string; path: string } {
  if (target.kind === "folder") {
    return { title: target.title, subtitle: t("videoUi.folder"), path: target.path };
  }
  return {
    title: target.episode.title,
    subtitle:
      target.episode.number < 99_000
        ? t("videoUi.episodeN", { n: target.episode.number })
        : t("videoUi.videoKind"),
    path: target.episode.path,
  };
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
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  labelDanger: { color: colors.danger },
});
