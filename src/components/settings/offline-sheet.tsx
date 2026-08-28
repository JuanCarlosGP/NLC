import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Clapperboard, Mic, Music2, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { OfflineItem, OfflineKind } from "@/lib/db/catalog";
import { useI18n } from "@/lib/i18n/context";
import { formatOfflineBytes } from "@/lib/offline/downloader";
import { useOffline } from "@/lib/offline/offline-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const KIND_IDS: { id: OfflineKind; labelKey: string; Icon: typeof Music2 }[] = [
  { id: "music", labelKey: "offlineSheet.music", Icon: Music2 },
  { id: "podcast", labelKey: "offlineSheet.podcasts", Icon: Mic },
  { id: "video", labelKey: "offlineSheet.video", Icon: Clapperboard },
];

export function OfflineSheet({
  open,
  onOpenChange,
  lockedKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedKind?: OfflineKind;
}) {
  const { t } = useI18n();
  const { progress, readyTracks, pendingTracks, start, pause, clear, remove } = useOffline();
  const [kind, setKind] = useState<OfflineKind>(lockedKind ?? "music");
  const activeKind = lockedKind ?? kind;
  const [pendingRemove, setPendingRemove] = useState<OfflineItem | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const supported = progress.supported;
  const isVideo = activeKind === "video";
  const canSync = !isVideo;
  const ready = readyTracks.filter((item) => item.kind === activeKind);
  const pending = pendingTracks.filter((item) => item.kind === activeKind);
  const readyBytes = ready.reduce((sum, item) => sum + item.localBytes, 0);
  const scopedTotal = ready.length + pending.length;
  const counts = useMemo(() => {
    const next = { music: 0, podcast: 0, video: 0 };
    for (const item of readyTracks) next[item.kind] += 1;
    return next;
  }, [readyTracks]);
  const pct = scopedTotal > 0 ? Math.min(1, ready.length / scopedTotal) : 0;

  const syncLabel =
    activeKind === "podcast" ? t("offlineSheet.syncPodcasts") : t("offlineSheet.syncMusic");
  const clearKindLabel =
    activeKind === "podcast"
      ? t("offlineSheet.clearPodcasts")
      : isVideo
        ? t("offlineSheet.clearEpisodes")
        : t("offlineSheet.clearMusic");
  const clearTitle =
    activeKind === "podcast"
      ? t("offlineSheet.clearTitlePodcasts")
      : isVideo
        ? t("offlineSheet.clearTitleChapters")
        : t("offlineSheet.clearTitleMusic");
  const clearMessage =
    activeKind === "podcast"
      ? t("offlineSheet.clearMessagePodcasts")
      : isVideo
        ? t("offlineSheet.clearMessageChapters")
        : t("offlineSheet.clearMessageMusic");

  const status = !supported
    ? t("offlineSheet.statusPhoneStorage")
    : progress.paused
      ? t("offlineSheet.statusPaused")
      : progress.running
        ? progress.currentTitle
          ? t("offlineSheet.statusDownloadingTitle", { title: progress.currentTitle })
          : t("offlineSheet.statusDownloadingCount", { done: progress.done, total: progress.total })
        : pending.length
          ? t("offlineSheet.statusPending", { count: pending.length })
          : scopedTotal
            ? activeKind === "podcast"
              ? t("offlineSheet.statusAllPodcasts")
              : t("offlineSheet.statusAllMusic")
            : t("offlineSheet.statusNothingSaved");

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("offlineSheet.close")}
      viewportRatio={0.82}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>{t("offlineSheet.title")}</Text>
          <Text style={type.pageTitle}>NLC</Text>
        </View>

        {lockedKind ? null : (
        <View style={styles.switch}>
          {KIND_IDS.map((item) => {
            const active = activeKind === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={t(item.labelKey)}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  triggerUiHaptic();
                  setKind(item.id);
                }}
                style={[styles.switchBtn, active && styles.switchBtnActive]}
              >
                <item.Icon size={15} color={active ? colors.void : colors.inkSoft} strokeWidth={1.9} />
                <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>
                  {t(item.labelKey)}
                  {counts[item.id] ? ` ${counts[item.id]}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        )}

        {isVideo ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("offlineSheet.videoLib")}</Text>
            <View style={styles.card}>
              <Text style={styles.empty}>{t("offlineSheet.videoLibHint")}</Text>
              {ready.length ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => setClearOpen(true)}
                    disabled={!supported}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnDanger,
                      { opacity: !supported ? 0.4 : pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.btnDangerText}>{t("offlineSheet.clearEpisodes")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("offlineSheet.progress")}</Text>
            <View style={styles.card}>
              <View style={styles.cardBody}>
                <Text style={styles.progressLabel}>
                  {t("offlineSheet.progressOf", { ready: ready.length, total: scopedTotal })} ·{" "}
                  {formatOfflineBytes(readyBytes)}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
                <Text style={styles.progressHint}>{status}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={progress.paused || !progress.running ? () => start(activeKind) : pause}
                  disabled={!supported}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnGhost,
                    { opacity: !supported ? 0.4 : pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>
                    {progress.running && !progress.paused ? t("offlineSheet.pause") : syncLabel}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setClearOpen(true)}
                  disabled={!supported || !ready.length}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnDanger,
                    { opacity: !supported || !ready.length ? 0.4 : pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.btnDangerText}>{clearKindLabel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <InventorySection
          title={t("offlineSheet.onPhone")}
          countLabel={ready.length ? `${ready.length} · ${formatOfflineBytes(readyBytes)}` : String(ready.length)}
          items={ready}
          empty={isVideo ? t("offlineSheet.videoReadyEmpty") : t("offlineSheet.readyEmpty")}
          supported={supported}
          onRemove={(item) => {
            triggerUiHaptic();
            setPendingRemove(item);
          }}
          t={t}
        />
        {canSync ? (
          <InventorySection
            title={t("offlineSheet.nasOnly")}
            countLabel={String(pending.length)}
            items={pending}
            empty={t("offlineSheet.pendingEmpty")}
            t={t}
          />
        ) : null}
      </SheetScrollView>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={t("offlineSheet.removeTitle")}
        message={pendingRemove ? t("offlineSheet.removeMessage", { title: pendingRemove.title }) : ""}
        confirmLabel={t("common.remove")}
        cancelLabel={t("common.cancel")}
        busy={removing}
        onCancel={() => {
          if (!removing) setPendingRemove(null);
        }}
        onConfirm={() => {
          if (!pendingRemove) return;
          void (async () => {
            setRemoving(true);
            await remove(pendingRemove.id);
            setRemoving(false);
            setPendingRemove(null);
          })();
        }}
      />
      <ConfirmDialog
        open={clearOpen}
        title={clearTitle}
        message={clearMessage}
        confirmLabel={t("settings.clearDoneAction")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          void (async () => {
            await clear(activeKind);
            setClearOpen(false);
          })();
        }}
      />
    </BottomSheet>
  );
}

function InventorySection({
  title,
  countLabel,
  items,
  empty,
  supported,
  onRemove,
  t,
}: {
  title: string;
  countLabel: string;
  items: OfflineItem[];
  empty: string;
  supported?: boolean;
  onRemove?: (item: OfflineItem) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>
        {title} · {countLabel}
      </Text>
      <View style={styles.card}>
        {items.length ? (
          items.slice(0, 80).map((item, index) => (
            <View key={item.id} style={[styles.item, index > 0 && styles.itemBorder]}>
              <View style={styles.itemMeta}>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.itemSub}>
                  {[item.artistName, item.albumName, item.localBytes ? formatOfflineBytes(item.localBytes) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {onRemove && supported ? (
                <Pressable
                  accessibilityLabel={t("offlineSheet.removeA11y", { title: item.title })}
                  onPress={() => onRemove(item)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.trash, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Trash2 color={colors.danger} size={16} strokeWidth={1.85} />
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.empty}>{empty}</Text>
        )}
        {items.length > 80 ? (
          <Text style={styles.more}>{t("offlineSheet.moreCount", { count: items.length - 80 })}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 48,
    gap: 22,
  },
  titleMeta: { gap: 4 },
  switch: {
    flexDirection: "row",
    gap: 8,
  },
  switchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
  },
  switchBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  switchLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  switchLabelActive: {
    color: colors.void,
  },
  section: { gap: 10 },
  sectionLabel: {
    ...type.label,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardBody: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  progressLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  progressHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.void,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.ok,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnGhost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  btnDanger: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised },
  btnGhostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
  btnDangerText: { fontFamily: fonts.sansSemiBold, color: colors.danger },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  itemMeta: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  itemSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  trash: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  more: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
