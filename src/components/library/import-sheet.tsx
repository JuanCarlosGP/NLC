import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft } from "lucide-react-native";
import { BottomSheet, resolveBottomInset } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useKeyboardBottomOverlap } from "@/components/chat/use-keyboard-bottom-overlap";
import { Cover } from "@/components/ui/cover";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { hydrateTrackArtworkCache, withTracksArtwork } from "@/lib/library/artwork-cache";
import { useSettings } from "@/lib/settings/settings-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { isPodcastTrack } from "@/lib/nas/webdav";
import type { Track } from "@/lib/nas/types";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import type { ImportedPlaylist } from "@/lib/spotify/types";

type Mode = "choose" | "spotify" | "youtube" | "nas";

export function ImportSheet({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (playlist: ImportedPlaylist) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("importSheet.close")}
      viewportRatio={0.92}
    >
      <ImportSheetBody
        open={open}
        onImported={(playlist) => {
          onImported(playlist);
          onOpenChange(false);
        }}
      />
    </BottomSheet>
  );
}

function PickTrackRow({
  track,
  selected,
  pickIndex,
  onToggle,
}: {
  track: Track;
  selected: boolean;
  pickIndex?: number;
  onToggle: () => void;
}) {
  const cover = useTrackArtwork(track);
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.pickRow, selected && styles.pickRowOn, { opacity: pressed ? 0.82 : 1 }]}
    >
      <Cover id={track.id} label={track.title} uri={cover} size={48} radius={4} />
      <View style={styles.pickMeta}>
        <Text numberOfLines={1} style={styles.pickTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.pickArtist}>
          {track.artistName}
        </Text>
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected && pickIndex != null ? (
          <Text style={styles.checkIndex}>{pickIndex}</Text>
        ) : selected ? (
          <Check size={14} color={colors.accentText} strokeWidth={2.6} />
        ) : null}
      </View>
    </Pressable>
  );
}

function ImportSheetBody({
  open,
  onImported,
}: {
  open: boolean;
  onImported: (playlist: ImportedPlaylist) => void;
}) {
  const { t } = useI18n();
  const spotify = useSpotify();
  const { source } = useSettings();
  const [mode, setMode] = useState<Mode>("choose");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { overlap: keyboardOverlap } = useKeyboardBottomOverlap(open && mode === "nas");
  const footerPad = 12 + bottomInset + keyboardOverlap;

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "nas") return;
    let cancelled = false;
    void (async () => {
      await hydrateTrackArtworkCache();
      const results = await source.search("*");
      if (cancelled) return;
      setTracks(withTracksArtwork(results.tracks.filter((track) => !isPodcastTrack(track))));
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, open, source]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((track) =>
      `${track.title} ${track.artistName} ${track.albumName}`.toLowerCase().includes(q),
    );
  }, [query, tracks]);

  const pickOrder = useMemo(() => {
    const order = new Map<string, number>();
    let index = 1;
    for (const id of picked) {
      order.set(id, index);
      index += 1;
    }
    return order;
  }, [picked]);

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadLink() {
    setBusy(true);
    setError(null);
    try {
      const playlist = await spotify.importPlaylistUrl(url);
      setUrl("");
      onImported(playlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importSheet.loadFail"));
    } finally {
      setBusy(false);
    }
  }

  async function createNas() {
    setBusy(true);
    setError(null);
    try {
      const byId = new Map(tracks.map((track) => [track.id, track]));
      const selected = [...picked]
        .map((id) => byId.get(id))
        .filter((track): track is Track => Boolean(track));
      const playlist = await spotify.createLocalPlaylist(name, selected);
      setName("");
      setPicked(new Set());
      onImported(playlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importSheet.createFail"));
    } finally {
      setBusy(false);
    }
  }

  function go(next: Mode) {
    setError(null);
    setMode(next);
  }

  return (
    <View style={styles.panel}>
      {mode === "choose" ? (
        <View style={styles.chooser}>
          <Text style={type.label}>{t("importSheet.add")}</Text>
          <Text style={type.pageTitle}>{t("importSheet.where")}</Text>
          <Pressable
            onPress={() => go("spotify")}
            style={({ pressed }) => [styles.choice, { opacity: pressed ? 0.86 : 1 }]}
          >
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>{t("importSheet.spotify")}</Text>
              <Text style={styles.choiceHint}>{t("importSheet.spotifyHint")}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => go("youtube")}
            style={({ pressed }) => [styles.choice, { opacity: pressed ? 0.86 : 1 }]}
          >
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>{t("importSheet.youtube")}</Text>
              <Text style={styles.choiceHint}>{t("importSheet.youtubeHint")}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => go("nas")}
            style={({ pressed }) => [styles.choice, { opacity: pressed ? 0.86 : 1 }]}
          >
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>{t("importSheet.ours")}</Text>
              <Text style={styles.choiceHint}>{t("importSheet.oursHint")}</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {mode !== "choose" ? (
        <View style={styles.header}>
          <Pressable
            onPress={() => go("choose")}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t("importSheet.back")}
          >
            <ChevronLeft color={colors.ink} size={22} strokeWidth={1.8} />
            <Text style={styles.backLabel}>{t("importSheet.back")}</Text>
          </Pressable>
          <Text style={type.label}>
            {mode === "spotify" ? t("importSheet.spotify") : mode === "youtube" ? t("importSheet.youtube") : t("importSheet.nas")}
          </Text>
          <Text style={type.pageTitle}>{mode === "nas" ? t("importSheet.newPlaylist") : t("importSheet.import")}</Text>
        </View>
      ) : null}

      {mode === "spotify" || mode === "youtube" ? (
        <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder={
              mode === "youtube"
                ? "https://music.youtube.com/playlist?list=…"
                : "https://open.spotify.com/playlist/..."
            }
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => void loadLink()}
            returnKeyType="go"
            style={styles.input}
          />
          <Pressable
            onPress={() => void loadLink()}
            disabled={busy || !url.trim()}
            style={({ pressed }) => [
              styles.loadBtn,
              { opacity: busy || !url.trim() ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.loadBtnText}>{busy ? t("importSheet.loading") : t("importSheet.load")}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </SheetScrollView>
      ) : null}

      {mode === "nas" ? (
        <View style={styles.nas}>
          <View style={styles.filters}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("importSheet.playlistName")}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("importSheet.searchPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              style={styles.input}
            />
          </View>
          <SheetScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {visible.map((track) => (
              <PickTrackRow
                key={track.id}
                track={track}
                selected={pickOrder.has(track.id)}
                pickIndex={pickOrder.get(track.id)}
                onToggle={() => toggle(track.id)}
              />
            ))}
          </SheetScrollView>
          <View style={[styles.footer, { paddingBottom: footerPad }]}>
            <Text style={styles.count}>
              {picked.size ? t("importSheet.picked", { count: picked.size }) : t("importSheet.pickTracks")}
            </Text>
            <Pressable
              onPress={() => void createNas()}
              disabled={busy || !name.trim() || picked.size === 0}
              style={({ pressed }) => [
                styles.createBtn,
                { opacity: busy || !name.trim() || picked.size === 0 ? 0.45 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.loadBtnText}>{busy ? t("importSheet.creating") : t("importSheet.create")}</Text>
            </Pressable>
          </View>
          {error ? <Text style={[styles.error, styles.footerError]}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  chooser: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 12,
  },
  choice: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 14,
  },
  choiceText: {
    flex: 1,
    gap: 4,
  },
  choiceTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 20,
    color: colors.ink,
  },
  choiceHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginLeft: -6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  nas: { flex: 1, minHeight: 0 },
  filters: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    flexShrink: 0,
  },
  scroll: { flex: 1, minHeight: 0 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.void,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loadBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  loadBtnText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  pickRowOn: {
    backgroundColor: colors.sheetRaised,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.ruleLight,
    backgroundColor: colors.sheet,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkIndex: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.accentText,
  },
  pickMeta: { flex: 1, minWidth: 0, gap: 2 },
  pickTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  pickArtist: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    backgroundColor: colors.sheet,
    flexShrink: 0,
  },
  count: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.inkSoft },
  createBtn: {
    minWidth: 108,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  footerError: { paddingHorizontal: 20, paddingBottom: 10 },
  error: { ...type.body, color: colors.danger },
});
