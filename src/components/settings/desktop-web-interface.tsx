import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, Platform, Pressable, Switch, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { colors, fonts } from "@/lib/theme";
import { createStyles } from "@/lib/appearance/density";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { webNative, type WebHostState } from "@/lib/backend/native-module";
import { startWebHost, stopWebHost } from "@/lib/backend/web-host";
import { remoteEnabled, PHONE_ONLY } from "@/lib/backend/profile";
import { bootstrap } from "@/lib/backend/remote";
export function DesktopWebInterface() {
 useThemeId();
 const [host, setHost] = useState<WebHostState | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 const supported = Platform.OS === "android" && !remoteEnabled;
 const refresh = () => { try { if (supported) setHost(webNative().webInterfaceState()); else if (remoteEnabled) void bootstrap(true).then(value => setHost({ ...value.desktop, bundleId: value.bundleId, batteryExempt: false })); } catch { setHost(null); } };
 useEffect(() => { refresh(); const timer = setInterval(refresh, 2000); const event = AppState.addEventListener("change", refresh); return () => { clearInterval(timer); event.remove(); }; }, []);
 async function toggle(next: boolean) {
  if (busy) return; setBusy(true); setError("");
  try { if (next) { const permission=await Notifications.getPermissionsAsync();if(!permission.granted)await Notifications.requestPermissionsAsync();await startWebHost(); } else await stopWebHost(); }
  catch (err) { setError(/address.*use|bind|busy/i.test(String(err)) ? "El puerto 7682 está ocupado" : err instanceof Error ? err.message : "No se pudo iniciar"); }
  finally { refresh(); setBusy(false); }
 }
 return <View><View style={styles.row}><View style={{ flex: 1, gap: 3 }}><Text style={styles.title}>Interfaz en el navegador</Text><Text style={styles.hint}>{remoteEnabled ? PHONE_ONLY : "Acceso desde tu red local"}</Text></View>
 <Switch accessibilityLabel="Interfaz en el navegador" disabled={!supported || busy} value={!!host?.running} onValueChange={value => void toggle(value)} trackColor={{ false: colors.rule, true: colors.accent }} thumbColor={colors.ink}/></View>
 {host?.running && <Text selectable style={styles.url}>{host.lanAddress && host.lanAddress !== "0.0.0.0" ? `http://${host.lanAddress}:7682` : "Conecta el móvil a tu red local"}</Text>}
 {supported && host?.running && !host.batteryExempt && <Pressable onPress={() => webNative().openWebBatterySettings()} style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Text style={styles.hint}>Batería · Permitir actividad en segundo plano</Text></Pressable>}
 {!!error && <Text style={[styles.url, { color: colors.danger }]}>{error}</Text>}
 </View>;
}
const styles = createStyles(() => ({ row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 }, title: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink }, hint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted }, url: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.accent, paddingHorizontal: 16, paddingBottom: 14 } }));
