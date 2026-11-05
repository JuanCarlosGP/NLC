import { useEffect } from "react";
import { Platform } from "react-native";
import { webNative } from "./native-module";
import { startWebHost } from "./web-host";
export function WebHostBootstrap() { useEffect(() => { if (Platform.OS !== "android") return; try { if (webNative().webInterfaceState().enabled) void startWebHost().catch(() => {}); } catch {} }, []); return null; }
