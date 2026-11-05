import { remoteEnabled } from "@/lib/backend/profile";
import * as Remote from "./player-context.shared";
import * as Local from "./player-context.legacy";
export type { PlayerContextValue } from "./player-context.shared";
export const PlayerProvider = remoteEnabled ? Remote.PlayerProvider : Local.PlayerProvider;
export const usePlayer = remoteEnabled ? Remote.usePlayer : Local.usePlayer;
export const usePlayerProgress = remoteEnabled ? Remote.usePlayerProgress : Local.usePlayerProgress;
