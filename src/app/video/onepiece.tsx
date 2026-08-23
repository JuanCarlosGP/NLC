import { Screen } from "@/components/ui/screen";
import { VideoBrowse } from "@/components/video/video-browse";
import { useSettings } from "@/lib/settings/settings-context";
import { onePieceRoot } from "@/lib/video/onepiece";

export default function OnePieceScreen() {
  const { settings } = useSettings();
  return (
    <Screen>
      <VideoBrowse path={onePieceRoot(settings)} />
    </Screen>
  );
}
