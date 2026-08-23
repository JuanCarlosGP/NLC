import { useEffect } from "react";
import { useRouter } from "expo-router";
import { usePlayerUi } from "@/lib/player/player-ui-context";

/** Deep link / recarga: abre el sheet de AppDomus y vuelve a la pantalla de detrás. */
export default function NowPlayingRoute() {
  const router = useRouter();
  const { openNowPlaying } = usePlayerUi();

  useEffect(() => {
    openNowPlaying();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [openNowPlaying, router]);

  return null;
}
