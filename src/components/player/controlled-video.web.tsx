import { createElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { attachBrowserVideo, mediaSession, loadMediaSession, playbackClientId } from "@/lib/player/session.web";
export function ControlledVideo({ path, startAt, onPlayingChange, onEnded }: { source?: unknown; path: string; startAt: number; onPlayingChange(playing: boolean): void; onEnded(): void }) {
 const state = useSyncExternalStore(mediaSession.subscribe, mediaSession.getSnapshot, mediaSession.getSnapshot); const container = useRef<HTMLDivElement>(null); const [error, setError] = useState("");
 useEffect(() => { let active = true; void loadMediaSession().then(async () => { const current = mediaSession.getSnapshot(); if (current.kind !== "video" || current.videoPath !== path) await mediaSession.video(path, startAt); }).catch(error => { if (active) setError(String(error)); }); return () => { active = false; }; }, [path]);
 useEffect(() => { if (container.current) attachBrowserVideo(container.current); }, [state.videoPath, state.playNonce, state.owner]);
 useEffect(() => { onPlayingChange(state.playing); }, [state.playing]);
 useEffect(() => { if (state.kind === "video" && state.videoPath === path && state.duration > 0 && state.currentTime >= state.duration - 0.5 && !state.playing) onEnded(); }, [state.currentTime, state.playing]);
 return <View style={{ flex: 1, backgroundColor: "#000" }}>{state.kind === "video" && state.videoPath === path && state.owner === playbackClientId ? createElement("div", { ref: container, style: { width: "100%", height: "100%", flex: 1 } }) : <Pressable onPress={() => { void (state.kind === "video" && state.videoPath === path ? mediaSession.transfer("browser") : mediaSession.video(path, startAt)).catch(error => setError(String(error))); }}><Text>{state.kind !== "video" || state.videoPath !== path ? "Reproducir vídeo" : state.owner === "phone" ? "Reproduciendo en el móvil · Reproducir aquí" : "Reproduciendo en otro navegador · Reproducir aquí"}</Text></Pressable>}{!!error && <Text>{error}</Text>}</View>;
}
