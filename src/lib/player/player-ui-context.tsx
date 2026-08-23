import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PlayerUiContextValue = {
  nowPlayingOpen: boolean;
  queueOpen: boolean;
  miniPlayerDismissed: boolean;
  setNowPlayingOpen: (open: boolean) => void;
  setQueueOpen: (open: boolean) => void;
  openNowPlaying: () => void;
  openQueue: () => void;
  dismissMiniPlayer: () => void;
  revealMiniPlayer: () => void;
};

const PlayerUiContext = createContext<PlayerUiContextValue | null>(null);

export function PlayerUiProvider({ children }: { children: ReactNode }) {
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [miniPlayerDismissed, setMiniPlayerDismissed] = useState(false);

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  const openQueue = useCallback(() => setQueueOpen(true), []);
  const dismissMiniPlayer = useCallback(() => setMiniPlayerDismissed(true), []);
  const revealMiniPlayer = useCallback(() => setMiniPlayerDismissed(false), []);

  const value = useMemo(
    () => ({
      nowPlayingOpen,
      queueOpen,
      miniPlayerDismissed,
      setNowPlayingOpen,
      setQueueOpen,
      openNowPlaying,
      openQueue,
      dismissMiniPlayer,
      revealMiniPlayer,
    }),
    [
      nowPlayingOpen,
      queueOpen,
      miniPlayerDismissed,
      openNowPlaying,
      openQueue,
      dismissMiniPlayer,
      revealMiniPlayer,
    ],
  );

  return <PlayerUiContext.Provider value={value}>{children}</PlayerUiContext.Provider>;
}

export function usePlayerUi(): PlayerUiContextValue {
  const ctx = useContext(PlayerUiContext);
  if (!ctx) throw new Error("usePlayerUi must be used within PlayerUiProvider");
  return ctx;
}
