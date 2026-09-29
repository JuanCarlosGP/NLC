import { router } from "expo-router";
import { getTracks } from "@/lib/db/catalog";
import type { Track } from "@/lib/nas/types";
import { decodeVideoId, watchRoute } from "@/lib/video/onepiece";

type DeviceStatus = {
  pos: number;
  dur: number;
  paused: boolean;
};

type DeviceControls = {
  play: (id: string) => void;
  pause: (paused: boolean) => void;
  stop: () => void;
  snapshot: () => DeviceStatus;
};

let controls: DeviceControls | null = null;
let videoControls: DeviceControls | null = null;
let deviceDriven = false;
let videoMode = false;
let ended = false;

export function bindDevicePlayer(next: DeviceControls | null) {
  controls = next;
}

export function bindDeviceVideo(next: DeviceControls | null) {
  videoControls = next;
}

export function deviceVideoActive(): boolean {
  return videoMode;
}

function openDeviceVideo(id: string) {
  const raw = decodeVideoId(id.slice("video:".length));
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const arc = path.replace(/\/[^/]+$/, "") || path;
  const route = watchRoute(path, arc);
  if (videoControls) router.replace(route);
  else router.push(route);
}

function closeDeviceVideo() {
  videoControls?.stop();
  videoMode = false;
  if (router.canGoBack()) router.back();
}

export function deviceDrivesPlayback(): boolean {
  return deviceDriven;
}

export function markDeviceEnded() {
  if (!deviceDriven) return;
  ended = true;
  deviceDriven = false;
}

export async function findDeviceTrack(id: string): Promise<Track | null> {
  if (!id) return null;
  const music = await getTracks({ kind: "music" });
  const hit = music.find((track) => track.id === id);
  if (hit) return hit;
  const podcasts = await getTracks({ kind: "podcast" });
  return podcasts.find((track) => track.id === id) ?? null;
}

export function handleDeviceQuery(query: Record<string, string>): Record<string, unknown> {
  const op = query.op || "status";
  if (!controls) return { ok: false, error: "player_unavailable" };
  if (op === "play") {
    const id = query.id || "";
    if (!id) return { ok: false, error: "missing_id" };
    deviceDriven = true;
    ended = false;
    if (id.startsWith("video:")) {
      videoMode = true;
      openDeviceVideo(id);
      return { ok: true };
    }
    if (videoMode) closeDeviceVideo();
    controls.play(id);
    return { ok: true };
  }
  const active = videoMode && videoControls ? videoControls : controls;
  if (op === "pause") {
    active.pause(query.paused !== "0");
    return { ok: true };
  }
  if (op === "stop") {
    deviceDriven = false;
    ended = false;
    if (videoMode) closeDeviceVideo();
    else active.stop();
    return { ok: true };
  }
  if (op === "volume") return { ok: true };
  const snap = active.snapshot();
  return { ok: true, ...snap, ended };
}
