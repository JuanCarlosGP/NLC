import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { VideoView, type VideoPlayer } from "expo-video";
import { Text } from "@/components/ui/themed-text";
import { mediaSession, loadMediaSession } from "@/lib/player/session";
export function ControlledVideo({ path, startAt, onPlayingChange, onEnded }: { source?: unknown; path: string; startAt: number; onPlayingChange(playing: boolean): void; onEnded(): void }) {
 const state = useSyncExternalStore(mediaSession.subscribe, mediaSession.getSnapshot, mediaSession.getSnapshot); const [error, setError] = useState("");
 useEffect(() => { let active = true; void loadMediaSession().then(async () => { const current = mediaSession.getSnapshot(); if (current.kind !== "video" || current.videoPath !== path) await mediaSession.video(path, startAt); }).catch(error => { if (active) setError(String(error)); }); return () => { active = false; }; }, [path]);
 useEffect(() => { onPlayingChange(state.playing); }, [state.playing]);
 useEffect(() => { if (state.kind === "video" && state.videoPath === path && state.duration > 0 && state.currentTime >= state.duration - 0.5 && !state.playing) onEnded(); }, [state.currentTime, state.playing]);
 const player = mediaSession.getPlayer() as VideoPlayer | undefined;
 return <View style={{ flex: 1, backgroundColor: "#000" }}>{state.kind === "video" && state.owner === "phone" && player ? <VideoView style={{ flex: 1, width: "100%", height: "100%" }} player={player} allowsFullscreen allowsPictureInPicture contentFit="contain" nativeControls/> : <Pressable onPress={() => { void mediaSession.toPhone(); }}><Text>Reproducir en el móvil</Text></Pressable>}{!!error && <Text>{error}</Text>}</View>;
}
