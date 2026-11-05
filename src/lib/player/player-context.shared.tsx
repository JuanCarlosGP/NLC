import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AudioPlayer } from "expo-audio";
import { mediaSession, loadMediaSession } from "./session";
import type { Track } from "@/lib/nas/types";
import type { RepeatMode } from "./types";
type Session = { player: AudioPlayer; queue: Track[]; index: number; current: Track | null; playing: boolean; buffering: boolean; shuffle: boolean; repeat: RepeatMode; playNonce: number; playTracks(tracks: Track[], index?: number): Promise<void>; enqueueTracks(tracks: Track[], where?: "next" | "end"): Promise<void>; skipQueue(direction: 1 | -1): Promise<void>; togglePlay(): Promise<void>; pause(): void; next(): Promise<void>; prev(): Promise<void>; seek(seconds: number): Promise<void>; toggleShuffle(): void; cycleRepeat(): void; removeTrackFromQueue(id: string): Promise<void> };
type Progress = { currentTime: number; duration: number };
export type PlayerContextValue = Session & Progress;
const Context = createContext<Session | null>(null); const Clock = createContext<Progress>({ currentTime: 0, duration: 0 });
export function PlayerProvider({ children }: { children: ReactNode }) {
 const state = useSyncExternalStore(mediaSession.subscribe, mediaSession.getSnapshot, mediaSession.getSnapshot);
 useEffect(() => { void loadMediaSession().catch(() => {}); }, []);
 const value = useMemo<Session>(() => ({ player: mediaSession.getPlayer() as AudioPlayer, queue: state.queue, index: state.index, current: state.queue[state.index] || null, playing: state.playing, buffering: state.buffering, shuffle: state.shuffle, repeat: state.repeat, playNonce: state.playNonce,
 playTracks: (tracks, index = 0) => mediaSession.play(tracks, index), enqueueTracks: async (tracks, where = "end") => { if (!mediaSession.getSnapshot().queue.length) await mediaSession.play(tracks); else await mediaSession.control("enqueue", { tracks, where }); },
 skipQueue: direction => mediaSession.next(direction), next: () => mediaSession.next(1), prev: () => mediaSession.next(-1), togglePlay: () => mediaSession.control("toggle"), pause: () => { if (mediaSession.getSnapshot().kind === "audio") void mediaSession.control("pause"); }, seek: seconds => mediaSession.control("seek", seconds), toggleShuffle: () => { void mediaSession.control("shuffle"); }, cycleRepeat: () => { void mediaSession.control("repeat"); }, removeTrackFromQueue: id => mediaSession.control("remove", id),
 }), [state.queue, state.index, state.playing, state.buffering, state.shuffle, state.repeat, state.playNonce, state.owner, state.kind]);
 const progress = useMemo(() => ({ currentTime: state.currentTime, duration: state.duration }), [state.currentTime, state.duration]);
 return <Context.Provider value={value}><Clock.Provider value={progress}>{children}</Clock.Provider></Context.Provider>;
}
export function usePlayer() { const value = useContext(Context); if (!value) throw new Error("PlayerProvider missing"); return value; }
export function usePlayerProgress() { return useContext(Clock); }
