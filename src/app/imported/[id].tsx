import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useImportedSheet } from "@/lib/spotify/imported-sheet-context";

export default function ImportedPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { openImported } = useImportedSheet();

  useEffect(() => {
    if (id) openImported(id);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [id, openImported, router]);

  return null;
}
