import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Clapperboard } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { listOnePieceSagas } from "@/lib/video/onepiece";
import type { VideoSaga } from "@/lib/video/types";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function OnePieceScreen() {
  const router = useRouter();
  const { settings, password, ready } = useSettings();
  const [sagas, setSagas] = useState<VideoSaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listOnePieceSagas(settings, password);
      setSagas(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar One Piece.");
      setSagas([]);
    } finally {
      setLoading(false);
    }
  }, [settings, password]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void refresh();
    }, [ready, refresh]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.art}>
          <Clapperboard color={colors.accent} size={36} strokeWidth={1.8} />
        </View>
        <Text style={type.pageTitle}>One Piece</Text>
        <Text style={type.meta}>
          {loading ? "Cargando sagas…" : `${sagas.length} sagas`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {sagas.map((saga) => (
        <Pressable
          key={saga.id}
          onPress={() => router.push({ pathname: "/video/saga/[id]", params: { id: saga.id } })}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={styles.order}>{saga.order}</Text>
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={2}>
              {saga.title}
            </Text>
            <Text style={styles.sub}>Saga</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingBottom: 4 },
  art: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { ...type.body, color: colors.danger },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  order: {
    width: 28,
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
  },
  meta: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
