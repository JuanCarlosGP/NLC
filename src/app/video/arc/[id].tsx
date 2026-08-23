import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { VideoBrowse } from "@/components/video/video-browse";
import { decodeVideoId } from "@/lib/video/onepiece";

export default function ArcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const path = decodeVideoId(Array.isArray(id) ? id[0]! : id ?? "");
  return (
    <Screen>
      <VideoBrowse path={path} />
    </Screen>
  );
}
