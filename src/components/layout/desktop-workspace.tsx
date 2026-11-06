import { Link, usePathname, useRouter } from "expo-router";
import { useState } from "react";
import {
  ArrowLeft, ChevronRight, Home, Library, ListMusic, MessageCircle,
  Pause, Play, Search, Settings, SkipBack, SkipForward,
} from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { ZONE_ICONS } from "@/components/layout/zone-switch";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { useNowPlaying } from "@/hooks/use-now-playing";
import { usePendingUpdate } from "@/hooks/use-app-update";
import { useCursor } from "@/hooks/use-cursor";
import { useI18n } from "@/lib/i18n/context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { APP_ZONES, useZone, type AppZone } from "@/lib/zone/zone-context";
import { formatTime } from "@/components/player/seek-bar";

const routes = [
  { href: "/", label: "chrome.home", icon: Home },
  { href: "/search", label: "chrome.search", icon: Search },
  { href: "/library", label: "chrome.library", icon: Library },
  { href: "/settings", label: "chrome.settings", icon: Settings },
] as const;

const routeZones: Partial<Record<string, AppZone>> = {
  music: "music", album: "music", artist: "music",
  podcasts: "podcast", video: "video",
  health: "health", wealth: "wealth",
  focus: "focus", projects: "focus", project: "focus", task: "focus",
};

const librarySections = new Set([
  ...Object.keys(routeZones), "library", "imported", "favorites",
]);

function useWorkspaceRoute() {
  const pathname = usePathname();
  const section = pathname.split("/")[1];
  const { zone } = useZone();
  const routeZone = routeZones[section];
  const activeZone = routeZone ?? zone;
  const activeHref = librarySections.has(section) ? "/library"
    : section === "settings" ? "/settings"
    : section === "search" ? "/search"
    : !section || section === "index" ? "/" : undefined;
  const libraryLabel = activeZone === "health" ? "health.records"
    : activeZone === "wealth" ? "chrome.ledger" : "chrome.library";
  const activeLabel = activeHref === "/library" ? libraryLabel
    : routes.find(({ href }) => href === activeHref)?.label;
  return { pathname, routeZone, activeZone, activeHref, activeLabel, libraryLabel };
}

export function DesktopSidebar() {
  const router = useRouter();
  const { t } = useI18n();
  const { enabled, setZone } = useZone();
  const { pathname, routeZone, activeZone, activeHref, libraryLabel } = useWorkspaceRoute();
  const { chatOpen, chatUnread, setChatOpen } = useCursor();
  const updatePending = usePendingUpdate();

  function selectZone(zone: AppZone) {
    if (!setZone(zone)) return;
    if (!routes.some(({ href }) => href === pathname)) router.navigate("/");
  }

  return (
    <aside className="nlc-sidebar">
      <Link href="/" asChild>
        <a className="nlc-sidebar-brand" aria-label={`NLC · ${t("chrome.home")}`}>
          <span className="nlc-sidebar-mark" aria-hidden={true}><Library size={17} /></span>
          NLC
        </a>
      </Link>
      <nav className="nlc-sidebar-nav" aria-label={t("chrome.navigation")}>
        {routes.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            asChild
            onPress={() => { if (routeZone) setZone(routeZone); }}
          >
            <a className="nlc-sidebar-item" aria-current={activeHref === href ? "page" : undefined}>
              <Icon size={17} aria-hidden={true} />
              <span>{t(href === "/library" ? libraryLabel : label)}</span>
              {href === "/settings" && updatePending && (
                <span className="nlc-sidebar-badge" aria-label={t("chrome.novelty")} />
              )}
            </a>
          </Link>
        ))}
        <button
          type="button"
          className="nlc-sidebar-item"
          aria-expanded={chatOpen}
          onClick={() => setChatOpen(!chatOpen)}
        >
          <MessageCircle size={17} aria-hidden={true} />
          <span>{t("chrome.messages")}</span>
          {chatUnread && <span className="nlc-sidebar-badge" aria-label={t("chrome.novelty")} />}
        </button>
      </nav>
      <nav className="nlc-sidebar-nav nlc-sidebar-zones" aria-label={t("settings.zones")}>
        <span className="nlc-sidebar-label" aria-hidden={true}>{t("settings.zones")}</span>
        {APP_ZONES.filter(({ id }) => enabled[id]).map(({ id }) => {
          const Icon = ZONE_ICONS[id];
          return (
            <button
              key={id}
              type="button"
              className="nlc-sidebar-item"
              aria-pressed={activeZone === id}
              onClick={() => selectZone(id)}
            >
              <Icon size={17} aria-hidden={true} />
              <span>{t(`zones.${id}`)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function DesktopToolbar() {
  const router = useRouter();
  const { t } = useI18n();
  const { pathname, activeZone, activeLabel } = useWorkspaceRoute();
  const showBack = !routes.some(({ href }) => href === pathname);

  return (
    <header className="nlc-desktop-toolbar">
      {showBack && (
        <button
          type="button"
          className="nlc-desktop-icon"
          aria-label={t("onboarding.back")}
          title={t("onboarding.back")}
          onClick={() => router.canGoBack() ? router.back() : router.navigate("/")}
        >
          <ArrowLeft size={17} aria-hidden={true} />
        </button>
      )}
      <span>{t(`zones.${activeZone}`)}</span>
      {activeLabel && (
        <>
          <ChevronRight size={13} aria-hidden={true} />
          <strong>{t(activeLabel)}</strong>
        </>
      )}
    </header>
  );
}

export function DesktopPlayer() {
  const { t } = useI18n();
  const { current, currentTime, duration, playing, togglePlay, prev, next, seek } = useNowPlaying();
  const { openNowPlaying } = usePlayerUi();
  const cover = useTrackArtwork(current);
  const [draft, setDraft] = useState<{ track: string; time: number } | null>(null);
  if (!current) return null;

  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const draftTime = draft?.track === current.id ? draft.time : undefined;
  const position = Math.max(0, Math.min(max, draftTime ?? (Number.isFinite(currentTime) ? currentTime : 0)));
  const playLabel = t(playing ? "common.pause" : "common.play");

  function commitSeek() {
    if (draftTime === undefined) return;
    setDraft(null);
    void seek(position);
  }

  return (
    <footer className="nlc-desktop-player" aria-label={t("player.playback")}>
      <button type="button" className="nlc-player-track" onClick={openNowPlaying}>
        <Cover id={current.id} label={current.title} uri={cover} size={40} radius={6} />
        <span>
          <strong>{current.title}</strong>
          <small>{current.artistName}</small>
        </span>
      </button>
      <div className="nlc-player-transport">
        <div className="nlc-player-buttons">
          <button type="button" className="nlc-desktop-icon" aria-label={t("chrome.previousTrack")} title={t("chrome.previousTrack")} onClick={() => void prev()}>
            <SkipBack size={17} fill="currentColor" aria-hidden={true} />
          </button>
          <button type="button" className="nlc-desktop-icon nlc-player-play" aria-label={playLabel} title={playLabel} onClick={() => void togglePlay()}>
            {playing ? <Pause size={17} fill="currentColor" aria-hidden={true} /> : <Play size={17} fill="currentColor" aria-hidden={true} />}
          </button>
          <button type="button" className="nlc-desktop-icon" aria-label={t("chrome.nextTrack")} title={t("chrome.nextTrack")} onClick={() => void next()}>
            <SkipForward size={17} fill="currentColor" aria-hidden={true} />
          </button>
        </div>
        <div className="nlc-player-timeline">
          <span>{formatTime(position)}</span>
          <input
            type="range"
            aria-label={t("chrome.playbackPosition")}
            min={0}
            max={max}
            step={0.1}
            value={position}
            disabled={!max}
            onChange={(event) => setDraft({ track: current.id, time: event.currentTarget.valueAsNumber })}
            onPointerUp={commitSeek}
            onPointerCancel={() => setDraft(null)}
            onKeyUp={commitSeek}
            onBlur={commitSeek}
          />
          <span>{formatTime(max)}</span>
        </div>
      </div>
      <button type="button" className="nlc-sidebar-item nlc-player-queue" onClick={openNowPlaying}>
        <ListMusic size={17} aria-hidden={true} />
        <span>{t("player.queue")}</span>
      </button>
    </footer>
  );
}
