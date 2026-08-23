import { Platform, Share } from "react-native";
import type { ImportedTrack } from "@/lib/spotify/types";

export function formatDurationMs(ms: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function formatPlaylistDuration(ms: number): string {
  if (!ms) return "";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function tracksToTxt(name: string, tracks: ImportedTrack[]): string {
  const lines = tracks.map((track, index) => `${index + 1}. ${track.artistName} - ${track.title}`);
  return [name, "", ...lines].join("\n");
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned || "playlist"}.txt`;
}

export async function shareTracksTxt(name: string, tracks: ImportedTrack[]): Promise<void> {
  const body = tracksToTxt(name, tracks);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename(name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: name, message: body });
}
