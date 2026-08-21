import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { pushRecent } from "@/lib/library/cache";
import type { Track } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";
import type { RepeatMode } from "@/lib/player/types";

type PlayerSessionValue = {
  player: AudioPlayer;
  queue: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  buffering: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  playNonce: number;
  playTracks: (tracks: Track[], startIndex?: number) => Promise<void>;
  skipQueue: (direction: 1 | -1) => Promise<void>;
  togglePlay: () => Promise<void>;
  pause: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeTrackFromQueue: (trackId: string) => Promise<void>;
};

type PlayerProgressValue = {
  currentTime: number;
  duration: number;
};

/** @deprecated Prefer usePlayer + usePlayerProgress; kept for seek/now-playing. */
export type PlayerContextValue = PlayerSessionValue & PlayerProgressValue;

const PlayerSessionContext = createContext<PlayerSessionValue | null>(null);
const PlayerProgressContext = createContext<PlayerProgressValue>({
  currentTime: 0,
  duration: 0,
});

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // Android < 13 or permission API unavailable.
  }
}

function shuffleIndices(length: number, start: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== start);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [start, ...rest];
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { source } = useSettings();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [playNonce, setPlayNonce] = useState(0);
  const finishingRef = useRef(false);
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const repeatRef = useRef(repeat);
  const sourceRef = useRef(source);
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const loadedRef = useRef(false);

  queueRef.current = queue;
  indexRef.current = index;
  repeatRef.current = repeat;
  sourceRef.current = source;
  currentTimeRef.current = status.currentTime ?? 0;
  playingRef.current = status.playing;
  loadedRef.current = status.isLoaded;

  const current = queue[index] ?? null;

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      interruptionModeAndroid: "doNotMix",
    });
  }, []);

  const loadAndPlay = useCallback(
    async (track: Track) => {
      const uri = await sourceRef.current.streamUrl(track.id);
      try {
        player.replace(uri);
        player.play();
      } catch (error) {
        console.warn("No se pudo cargar el audio", error);
        return;
      }
      void pushRecent(track);
      void ensureNotificationPermission();
      try {
        const cover =
          track.artworkUrl ||
          (track.coverId ? await sourceRef.current.coverUrl(track.coverId, 256) : null);
        const lockPlayer = player as AudioPlayer & {
          setActiveForLockScreen?: (
            active: boolean,
            metadata: {
              title?: string;
              artist?: string;
              albumTitle?: string;
              artworkUrl?: string;
            },
          ) => void;
        };
        lockPlayer.setActiveForLockScreen?.(true, {
          title: track.title,
          artist: track.artistName,
          albumTitle: track.albumName,
          artworkUrl: cover ?? undefined,
        });
      } catch {
        // Lock screen metadata is best-effort on Expo Go / older expo-audio.
      }
    },
    [player],
  );

  const playTracks = useCallback(
    async (tracks: Track[], startIndex = 0) => {
      if (!tracks.length) return;
      const ordered = shuffle
        ? shuffleIndices(tracks.length, startIndex).map((i) => tracks[i])
        : tracks;
      const nextIndex = shuffle ? 0 : startIndex;
      setQueue(ordered);
      setIndex(nextIndex);
      setPlayNonce((value) => value + 1);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await loadAndPlay(ordered[nextIndex]);
    },
    [loadAndPlay, shuffle],
  );

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Native player may already be idle.
    }
  }, [player]);

  const togglePlay = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const track = queueRef.current[indexRef.current];
    if (!track) return;
    if (playingRef.current) {
      pause();
      return;
    }
    if (!loadedRef.current) {
      await loadAndPlay(track);
      return;
    }
    player.play();
  }, [loadAndPlay, pause, player]);

  const next = useCallback(async () => {
    const items = queueRef.current;
    if (!items.length) return;
    const currentIndex = indexRef.current;
    if (repeatRef.current === "one") {
      await player.seekTo(0);
      player.play();
      return;
    }
    const upcoming = currentIndex + 1;
    if (upcoming < items.length) {
      setIndex(upcoming);
      await loadAndPlay(items[upcoming]);
      return;
    }
    if (repeatRef.current === "all") {
      setIndex(0);
      await loadAndPlay(items[0]);
      return;
    }
    player.pause();
  }, [loadAndPlay, player]);

  const prev = useCallback(async () => {
    const items = queueRef.current;
    if (!items.length) return;
    if (currentTimeRef.current > 3) {
      await player.seekTo(0);
      return;
    }
    const currentIndex = indexRef.current;
    const upcoming = Math.max(0, currentIndex - 1);
    setIndex(upcoming);
    await loadAndPlay(items[upcoming]);
  }, [loadAndPlay, player]);

  const skipQueue = useCallback(
    async (direction: 1 | -1) => {
      const items = queueRef.current;
      if (!items.length) return;
      const currentIndex = indexRef.current;
      let upcoming = currentIndex + direction;
      if (upcoming >= items.length) {
        if (repeatRef.current !== "all") return;
        upcoming = 0;
      } else if (upcoming < 0) {
        if (repeatRef.current !== "all") return;
        upcoming = items.length - 1;
      }
      if (upcoming === currentIndex) return;
      setIndex(upcoming);
      await loadAndPlay(items[upcoming]);
    },
    [loadAndPlay],
  );

  const seek = useCallback(
    async (seconds: number) => {
      await player.seekTo(Math.max(0, seconds));
    },
    [player],
  );

  const toggleShuffle = useCallback(() => {
    setShuffle((value) => !value);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((value) => (value === "off" ? "all" : value === "all" ? "one" : "off"));
  }, []);

  const removeTrackFromQueue = useCallback(
    async (trackId: string) => {
      const items = queueRef.current;
      const currentIndex = indexRef.current;
      if (!items.length) return;
      const nextQueue = items.filter((track) => track.id !== trackId);
      if (nextQueue.length === items.length) return;

      const wasCurrent = items[currentIndex]?.id === trackId;
      const removedBefore = items
        .slice(0, currentIndex)
        .filter((track) => track.id === trackId).length;

      setQueue(nextQueue);
      setPlayNonce((value) => value + 1);

      if (!nextQueue.length) {
        setIndex(0);
        pause();
        return;
      }

      if (wasCurrent) {
        const newIndex = Math.min(currentIndex, nextQueue.length - 1);
        setIndex(newIndex);
        await loadAndPlay(nextQueue[newIndex]!);
        return;
      }

      setIndex(Math.max(0, currentIndex - removedBefore));
    },
    [loadAndPlay, pause],
  );

  useEffect(() => {
    if (!status.didJustFinish || finishingRef.current) return;
    finishingRef.current = true;
    void next().finally(() => {
      finishingRef.current = false;
    });
  }, [next, status.didJustFinish]);

  const session = useMemo<PlayerSessionValue>(
    () => ({
      player,
      queue,
      index,
      current,
      playing: status.playing,
      buffering: Boolean(status.isBuffering),
      shuffle,
      repeat,
      playNonce,
      playTracks,
      skipQueue,
      togglePlay,
      pause,
      next,
      prev,
      seek,
      toggleShuffle,
      cycleRepeat,
      removeTrackFromQueue,
    }),
    [
      player,
      queue,
      index,
      current,
      status.playing,
      status.isBuffering,
      shuffle,
      repeat,
      playNonce,
      playTracks,
      skipQueue,
      togglePlay,
      pause,
      next,
      prev,
      seek,
      toggleShuffle,
      cycleRepeat,
      removeTrackFromQueue,
    ],
  );

  const progress = useMemo<PlayerProgressValue>(
    () => ({
      currentTime: status.currentTime ?? 0,
      duration: status.duration ?? 0,
    }),
    [status.currentTime, status.duration],
  );

  return (
    <PlayerSessionContext.Provider value={session}>
      <PlayerProgressContext.Provider value={progress}>{children}</PlayerProgressContext.Provider>
    </PlayerSessionContext.Provider>
  );
}

/** Session + controls. Does not re-render every progress tick. */
export function usePlayer(): PlayerSessionValue {
  const ctx = useContext(PlayerSessionContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

/** High-frequency clock for seek UI only. */
export function usePlayerProgress(): PlayerProgressValue {
  return useContext(PlayerProgressContext);
}
