import { useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react-native";
import { remoteEnabled } from "@/lib/backend/profile";
import { useI18n } from "@/lib/i18n/context";
import { getBrowserMusicVolume, saveBrowserMusicVolume } from "@/lib/player/browser-music-volume";
import { usePlayer } from "@/lib/player/player-context";
import { mediaSession, playbackClientId } from "@/lib/player/session.web";

function canAdjustVolume() {
  const { owner, kind } = mediaSession.getSnapshot();
  return !remoteEnabled || (owner === playbackClientId && kind === "audio");
}

export function DesktopVolume() {
  const { t } = useI18n();
  const { player } = usePlayer();
  const enabled = useSyncExternalStore(mediaSession.subscribe, canAdjustVolume, canAdjustVolume);
  const [volume, setVolume] = useState(getBrowserMusicVolume);
  const label = t("chrome.browserVolume");
  const Icon = volume === 0 ? VolumeX : Volume2;

  return (
    <div className="nlc-player-volume" title={enabled ? label : t("chrome.browserVolumeHint")}>
      <Icon size={17} aria-hidden={true} />
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        aria-label={label}
        disabled={!enabled}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber / 100;
          saveBrowserMusicVolume(next);
          if (remoteEnabled) mediaSession.setMusicVolume(next);
          else player.volume = next;
          setVolume(next);
        }}
      />
    </div>
  );
}
