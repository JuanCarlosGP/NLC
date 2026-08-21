import { usePlayer, usePlayerProgress } from "@/lib/player/player-context";

/** Now-playing sheet: session + live progress (re-renders while seeking/playing). */
export function useNowPlaying() {
  const session = usePlayer();
  const progress = usePlayerProgress();
  return { ...session, ...progress };
}
