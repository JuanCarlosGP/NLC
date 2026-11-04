import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { Screen } from "@/components/ui/screen";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { demoSummary, seedLocalDemo } from "@/lib/dev/seed-demo";
import { useI18n } from "@/lib/i18n/context";
import { useSettings } from "@/lib/settings/settings-context";
import { useZone } from "@/lib/zone/zone-context";
import { colors, fonts, type } from "@/lib/theme";

export default function LocalDemoScreen() {
  useThemeId();
  const { setLocale } = useI18n();
  const { reloadSource } = useSettings();
  const { setZone } = useZone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof demoSummary>> | null>(null);
  useEffect(() => { if (localDemoEnabled) void demoSummary().then(setSummary).catch((err) => setError(String(err))); }, []);
  if (!localDemoEnabled) return <Screen><Text style={type.body}>Esta herramienta solo está disponible en la sesión local de prueba.</Text></Screen>;
  async function load() {
    setBusy(true); setError("");
    try {
      const next = await seedLocalDemo();
      setSummary(next); setLocale("es"); setZone("health"); reloadSource();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return <Screen>
    <Text style={type.label}>NLC · DATOS FICTICIOS</Text>
    <Text style={type.pageTitle}>Prueba completa en local</Text>
    <Text style={type.body}>Biblioteca, podcasts, vídeo, tareas, patrimonio, peso, entrenamientos, medicación, fotos y nutrición de prueba. Se usa una base de datos de prueba independiente y un NAS simulado en este equipo.</Text>
    <Text style={type.meta}>El audio y el vídeo son archivos generados para esta prueba. Las descargas están simuladas; no se accede a bancos, Spotify, YouTube ni cuentas personales.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={styles.button}>
      <Text style={styles.buttonText}>{busy ? "Preparando…" : "Cargar escenario de prueba"}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {summary ? <View style={styles.summary}>
      {Object.entries(summary).map(([key, value]) => <Text style={type.body} key={key}>{key}: {value}</Text>)}
    </View> : null}
    {summary && summary.weights > 0 ? <Pressable accessibilityRole="button" onPress={() => window.location.assign("/")} style={styles.button}>
      <Text style={styles.buttonText}>Abrir aplicación con datos</Text>
    </Pressable> : null}
    <Text style={type.meta}>La carga es idempotente: volver a pulsar no borra las modificaciones que hagas durante las pruebas.</Text>
  </Screen>;
}

const styles = createStyles(() => ({
  button: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { fontFamily: fonts.sansMedium, color: colors.accentText, fontSize: 15 },
  summary: { padding: 16, borderWidth: 1, borderColor: colors.rule, borderRadius: 12, gap: 5 },
  error: { ...type.body, color: colors.danger },
}));
