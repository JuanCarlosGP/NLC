import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { VideoEpisode } from "@/lib/video/types";

export type VideoActionsTarget =
  | { kind: "folder"; id: string; path: string; title: string }
  | { kind: "episode"; episode: VideoEpisode; index: number };

type VideoActionsContextValue = {
  open: boolean;
  target: VideoActionsTarget | null;
  onChanged: (() => void) | null;
  setOpen: (open: boolean) => void;
  openVideoActions: (target: VideoActionsTarget, opts?: { onChanged?: () => void }) => void;
};

const VideoActionsContext = createContext<VideoActionsContextValue | null>(null);

export function VideoActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<VideoActionsTarget | null>(null);
  const [onChanged, setOnChanged] = useState<(() => void) | null>(null);

  const openVideoActions = useCallback((next: VideoActionsTarget, opts?: { onChanged?: () => void }) => {
    setTarget(next);
    setOnChanged(() => opts?.onChanged ?? null);
    setOpen(true);
  }, []);

  return (
    <VideoActionsContext.Provider value={{ open, target, onChanged, setOpen, openVideoActions }}>
      {children}
    </VideoActionsContext.Provider>
  );
}

export function useVideoActions(): VideoActionsContextValue {
  const ctx = useContext(VideoActionsContext);
  if (!ctx) throw new Error("useVideoActions must be used within VideoActionsProvider");
  return ctx;
}
