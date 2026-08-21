import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import {
  decodeVideoId,
  formatEpisodeRange,
  listOnePieceArcs,
  parseSagaName,
} from "@/lib/video/onepiece";
import type { VideoArc } from "@/lib/video/types";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function SagaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings, password, ready } = useSettings();
  const sagaPath = decodeVideoId(Array.isArray(id) ? id[0]! : id ?? "");
  const sagaName = sagaPath.split("/").pop() ?? "";
  const sagaMeta = parseSagaName(sagaName);
  const [arcs, setArcs] = useState<VideoArc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sagaPath) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listOnePieceArcs(settings, password, sagaPath);
      setArcs(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los arcos.");
      setArcs([]);
    } finally {
      setLoading(false);
    }
  }, [settings, password, sagaPath]);

  useFocusEffect(
    useCallback(() => {
      if (ready && sagaPath) void refresh();
    }, [ready, sagaPath, refresh]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.pageTitle}>{sagaMeta?.title ?? sagaName}</Text>
        <Text style={type.meta}>
          {loading ? "Cargando arcos…" : `${arcs.length} arcos`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {arcs.map((arc) => {
        const range = formatEpisodeRange(arc.episodeStart, arc.episodeEnd);
        return (
          <Pressable
            key={arc.id}
            onPress={() => router.push({ pathname: "/video/arc/[id]", params: { id: arc.id } })}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={styles.order}>{String(arc.order).padStart(2, "0")}</Text>
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>
                {arc.title}
              </Text>
              {range ? <Text style={styles.sub}>{range}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingBottom: 4 },
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
    width: 32,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.muted,
  },
  meta: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
