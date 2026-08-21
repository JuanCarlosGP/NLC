import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { colors, fonts, type } from "@/lib/theme";
import type { ImportedPlaylist } from "@/lib/spotify/types";

export function ImportSheet({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (playlist: ImportedPlaylist) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar importar"
      viewportRatio={0.55}
    >
      <ImportSheetBody
        onImported={(playlist) => {
          onImported(playlist);
          onOpenChange(false);
        }}
      />
    </BottomSheet>
  );
}

function ImportSheetBody({ onImported }: { onImported: (playlist: ImportedPlaylist) => void }) {
  const spotify = useSpotify();
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setImporting(true);
    setError(null);
    try {
      const playlist = await spotify.importPlaylistUrl(url);
      setUrl("");
      onImported(playlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.label}>Spotify</Text>
      <Text style={type.pageTitle}>Importar</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://open.spotify.com/playlist/…"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => void load()}
        returnKeyType="go"
        style={styles.input}
      />
      <Pressable
        onPress={() => void load()}
        disabled={importing || !url.trim()}
        style={({ pressed }) => [
          styles.loadBtn,
          { opacity: importing || !url.trim() ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.loadBtnText}>{importing ? "Cargando…" : "Cargar"}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
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
  error: { ...type.body, color: colors.danger },
});
