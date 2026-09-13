import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ImageIcon, Pencil, Upload, X } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { useI18n } from "@/lib/i18n/context";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function EditPlaylistDialog({
  open,
  playlist,
  onClose,
  onSave,
}: {
  open: boolean;
  playlist: ImportedPlaylist;
  onClose: () => void;
  onSave: (updates: { name: string; coverUrl: string | null }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(playlist.name);
  const [coverUrl, setCoverUrl] = useState<string>(playlist.coverUrl ?? "");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName(playlist.name);
      setCoverUrl(playlist.coverUrl ?? "");
      setBusy(false);
    }
  }, [open, playlist]);

  const candidateCovers = useMemo(() => {
    const set = new Set<string>();
    for (const track of playlist.tracks) {
      if (track.coverUrl) set.add(track.coverUrl);
      if (track.matched?.artworkUrl) set.add(track.matched.artworkUrl);
    }
    return Array.from(set);
  }, [playlist.tracks]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      await onSave({
        name: trimmedName,
        coverUrl: coverUrl.trim() || null,
      });
      triggerUiHaptic();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelect(event: any) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverUrl(reader.result);
        triggerUiHaptic();
      }
    };
    reader.readAsDataURL(file);
  }

  const previewUri = coverUrl.trim() || null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <Pressable
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
      >
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Pencil color={colors.accent} size={20} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>{t("playlistActions.editTitle")}</Text>
          </View>

          {/* Cover Preview and Quick Actions */}
          <View style={styles.coverSection}>
            <Cover
              id={playlist.id}
              label={name || playlist.name}
              uri={previewUri}
              size={72}
              radius={8}
            />
            <View style={styles.coverMeta}>
              {previewUri ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    triggerUiHaptic();
                    setCoverUrl("");
                  }}
                  style={({ pressed }) => [
                    styles.smallBtn,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <X color={colors.inkSoft} size={14} strokeWidth={2} />
                  <Text style={styles.smallBtnText}>
                    {t("playlistActions.removeCover")}
                  </Text>
                </Pressable>
              ) : null}

              {Platform.OS === "web" ? (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef as any}
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      triggerUiHaptic();
                      fileInputRef.current?.click();
                    }}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Upload color={colors.inkSoft} size={14} strokeWidth={2} />
                    <Text style={styles.smallBtnText}>
                      {t("playlistActions.uploadImage")}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>

          {/* Name Field */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("playlistActions.nameLabel")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("playlistActions.nameLabel")}
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={120}
              autoCapitalize="sentences"
            />
          </View>

          {/* Cover URL Field */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("playlistActions.coverLabel")}</Text>
            <TextInput
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="https://... o /Music/..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Track covers picker */}
          {candidateCovers.length > 0 ? (
            <View style={styles.trackCoversSection}>
              <Text style={styles.subLabel}>
                {t("playlistActions.chooseFromTracks")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trackCoversRow}
              >
                {candidateCovers.map((uri, idx) => (
                  <Pressable
                    key={`${uri}-${idx}`}
                    onPress={() => {
                      triggerUiHaptic();
                      setCoverUrl(uri);
                    }}
                    style={({ pressed }) => [
                      styles.trackCoverThumb,
                      previewUri === uri && styles.trackCoverThumbSelected,
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Cover id={`thumb-${idx}`} label="" uri={uri} size={44} radius={6} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                { opacity: busy ? 0.35 : pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={styles.btnGhostText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || !name.trim()}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.btn,
                styles.btnAccent,
                {
                  opacity:
                    busy || !name.trim() ? 0.5 : pressed ? 0.86 : 1,
                },
              ]}
            >
              <Text style={styles.btnAccentText}>{t("common.save")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 7, 10, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.ruleLight,
    backgroundColor: colors.sheetRaised,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(228, 213, 184, 0.12)",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  coverSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.sheetHover,
    padding: 10,
    borderRadius: 12,
  },
  coverMeta: {
    flex: 1,
    gap: 8,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderColor: colors.rule,
    alignSelf: "flex-start",
  },
  smallBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  field: {
    gap: 6,
  },
  label: {
    ...type.label,
    color: colors.inkSoft,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subLabel: {
    ...type.meta,
    color: colors.inkSoft,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trackCoversSection: {
    gap: 4,
  },
  trackCoversRow: {
    gap: 8,
    paddingVertical: 4,
  },
  trackCoverThumb: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  trackCoverThumbSelected: {
    borderColor: colors.accent,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 46,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
  },
  btnGhostText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.inkSoft,
  },
  btnAccent: {
    backgroundColor: colors.accent,
  },
  btnAccentText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.void,
  },
});
