const STORAGE_KEY = "nlc.music.volume.v1";
let volume: number | undefined;

export function getBrowserMusicVolume() {
  if (volume !== undefined) return volume;
  if (typeof window === "undefined") return 1;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const value = saved === null ? 1 : Number(saved);
    volume = Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
  } catch {
    volume = 1;
  }
  return volume;
}

export function saveBrowserMusicVolume(value: number) {
  volume = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage may be blocked. Keep the setting for the current tab.
  }
}
