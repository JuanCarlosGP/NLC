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
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function VideoActionsSheet() {
  const { open, target, setOpen } = useVideoActions();
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      accessibilityCloseLabel="Cerrar opciones de vídeo"
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
  const router = useRouter();
  const { settings, password } = useSettings();
  const { onChanged } = useVideoActions();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"download" | "delete" | "remove" | null>(null);
  const [episodes, setEpisodes] = useState<VideoEpisode[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [liked, setLiked] = useState(false);
  const meta = targetMeta(target);
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
          label={target.kind === "episode" ? "Ver" : "Abrir"}
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
          label={liked ? "Quitar de favoritos" : "Añadir a favoritos"}
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
              episodes.length > 1 ? `Descargar ${episodes.length} episodios` : "Descargar al teléfono"
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
            label={readyCount > 1 ? `Quitar ${readyCount} del teléfono` : "Quitar del teléfono"}
            onPress={() => {
              triggerUiHaptic();
              setConfirm("remove");
            }}
          />
        ) : null}
        {canContinue ? (
          <ActionRow
            icon={<EyeOff color={colors.ink} size={22} strokeWidth={1.8} />}
            label="Quitar de continuar viendo"
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
          label="Eliminar del NAS"
          danger
          onPress={() => {
            triggerUiHaptic();
            setConfirm("delete");
          }}
        />
      </SheetScrollView>

      <ConfirmDialog
        open={confirm === "download"}
        title="Descargar al teléfono"
        message={`Se bajarán ${episodes.length} episodios de «${meta.title}». Pesan mucho.`}
        confirmLabel="Descargar"
        cancelLabel="Cancelar"
        destructive={false}
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={() => void download()}
      />
      <ConfirmDialog
        open={confirm === "remove"}
        title="Quitar del teléfono"
        message={`Se borran las copias locales de «${meta.title}». El NAS no se toca.`}
        confirmLabel="Quitar"
        cancelLabel="Cancelar"
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
        onConfirm={() => void removeLocal()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Eliminar del NAS"
        message={
          episodes.length > 1
            ? `Se borrarán ${episodes.length} episodios de «${meta.title}» del NAS.`
            : `Se borrará «${meta.title}» del NAS.`
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
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

function targetMeta(target: VideoActionsTarget): { title: string; subtitle: string; path: string } {
  if (target.kind === "folder") {
    return { title: target.title, subtitle: "Carpeta", path: target.path };
  }
  return {
    title: target.episode.title,
    subtitle: target.episode.number < 99_000 ? `Episodio ${target.episode.number}` : "Vídeo",
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
