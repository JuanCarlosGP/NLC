import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Track } from "@/lib/nas/types";

export type TrackActionsTarget = {
  track: Track;
  playlistId?: string;
};

type TrackActionsContextValue = {
  open: boolean;
  target: TrackActionsTarget | null;
  setOpen: (open: boolean) => void;
  openTrackActions: (track: Track, opts?: { playlistId?: string }) => void;
};

const TrackActionsContext = createContext<TrackActionsContextValue | null>(null);

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TrackActionsTarget | null>(null);

  const openTrackActions = useCallback((track: Track, opts?: { playlistId?: string }) => {
    setTarget({ track, playlistId: opts?.playlistId });
    setOpen(true);
  }, []);

  return (
    <TrackActionsContext.Provider value={{ open, target, setOpen, openTrackActions }}>
      {children}
    </TrackActionsContext.Provider>
  );
}

export function useTrackActions(): TrackActionsContextValue {
  const ctx = useContext(TrackActionsContext);
  if (!ctx) throw new Error("useTrackActions must be used within TrackActionsProvider");
  return ctx;
}
