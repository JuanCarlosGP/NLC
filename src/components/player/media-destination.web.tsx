import { useRouter, usePathname } from "expo-router";
import { watchRoute } from "@/lib/video/onepiece";
import { useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { mediaSession, playbackClientId } from "@/lib/player/session.web";
import { remoteEnabled } from "@/lib/backend/profile";
import { colors, type } from "@/lib/theme";
import { useThemeId } from "@/lib/appearance/use-theme-id";
export function MediaDestination() { useThemeId(); const router=useRouter(),path=usePathname(); const state = useSyncExternalStore(mediaSession.subscribe, mediaSession.getSnapshot, mediaSession.getSnapshot); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); if (!remoteEnabled) return null;
 async function transfer(target: "browser" | "phone") { setBusy(true); setError(""); try { await mediaSession.transfer(target); const current=mediaSession.getSnapshot();if(target==="browser"&&current.kind==="video"&&current.videoPath&&!path.startsWith("/watch/"))router.push(watchRoute(current.videoPath,current.videoPath.slice(0,current.videoPath.lastIndexOf("/")))); } catch (error) { setError(String(error)); } finally { setBusy(false); } }
 return <View style={{ gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.rule, backgroundColor: colors.void }}><View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}><Text style={type.meta}>Reproducir en:</Text>{(["browser", "phone"] as const).map(target => <Pressable key={target} disabled={busy} accessibilityRole="radio" aria-checked={target === "phone" ? state.owner === "phone" : state.owner === playbackClientId} accessibilityState={{ checked: target === "phone" ? state.owner === "phone" : state.owner === playbackClientId }} onPress={() => void transfer(target)}><Text style={[type.meta, { color: (target === "phone" ? state.owner === "phone" : state.owner === playbackClientId) ? colors.ink : colors.muted }]}>{target === "phone" ? "Móvil" : "Este navegador"}</Text></Pressable>)}</View>{!!error && <Text style={[type.meta, { color: colors.danger }]}>{error}</Text>}</View>;
}
