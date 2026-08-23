import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";

type PlaylistActionsContextValue = {
  open: boolean;
  playlist: ImportedPlaylist | null;
  setOpen: (open: boolean) => void;
  openPlaylistActions: (playlist: ImportedPlaylist) => void;
};

const PlaylistActionsContext = createContext<PlaylistActionsContextValue | null>(null);

export function PlaylistActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [playlist, setPlaylist] = useState<ImportedPlaylist | null>(null);

  const openPlaylistActions = useCallback((next: ImportedPlaylist) => {
    triggerUiHaptic();
    setPlaylist(next);
    setOpen(true);
  }, []);

  return (
    <PlaylistActionsContext.Provider value={{ open, playlist, setOpen, openPlaylistActions }}>
      {children}
    </PlaylistActionsContext.Provider>
  );
}

export function usePlaylistActions(): PlaylistActionsContextValue {
  const ctx = useContext(PlaylistActionsContext);
  if (!ctx) throw new Error("usePlaylistActions must be used within PlaylistActionsProvider");
  return ctx;
}
