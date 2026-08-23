import { useEffect } from "react";
import { useRouter } from "expo-router";
import { usePlayerUi } from "@/lib/player/player-ui-context";

export default function QueueRoute() {
  const router = useRouter();
  const { openNowPlaying } = usePlayerUi();

  useEffect(() => {
    openNowPlaying();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [openNowPlaying, router]);

  return null;
}
