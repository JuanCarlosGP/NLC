import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import {
  addBridgeClaimedListener,
  addBridgeRequestListener,
  addBridgeUnlinkedListener,
  failBridgeRequest,
  getBridgeLink,
  isBridgeUnlinked,
  isLanBridgeAvailable,
  resolveBridgeJson,
  resolveBridgeStream,
  startLanBridge,
  stopLanBridge,
} from "nlc-lan-bridge";
import { handleBridgeRequest } from "@/lib/bridge/handle-request";
import { BRIDGE_PORT, clearBridgeSession, loadBridgeToken, saveBridgeToken, saveDesktopHost } from "@/lib/bridge/session";
import { useSettings } from "@/lib/settings/settings-context";

async function dropLink() {
  try {
    await stopLanBridge();
  } catch {
    // already stopped
  }
  await clearBridgeSession();
  try {
    await startLanBridge(BRIDGE_PORT, "", false);
  } catch {
    // discoverable listener is best-effort
  }
}

async function syncNativeLink() {
  const link = getBridgeLink();
  if (!link?.token) return;
  await saveBridgeToken(link.token);
  if (link.desktopHost) await saveDesktopHost(link.desktopHost);
}

export function BridgeHost({ children }: { children: ReactNode }) {
  const { source, ready } = useSettings();
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    if (!isLanBridgeAvailable) return;
    const sub = addBridgeRequestListener((event) => {
      void (async () => {
        try {
          const route = event.path.replace(/\/+$/, "") || "/";
          const result = await handleBridgeRequest(sourceRef.current, event.path, event.query);
          const isStream = event.path === "/v1/stream" || event.path.startsWith("/v1/stream/");
          if (isStream) {
            if (result.kind === "stream") {
              resolveBridgeStream(event.id, result.uri, result.headers);
            } else {
              const message =
                result.kind === "json" && result.body && typeof result.body === "object" && "error" in result.body
                  ? String((result.body as { error: unknown }).error)
                  : "stream";
              failBridgeRequest(event.id, result.status, message);
            }
            return;
          }
          if (result.kind === "json") {
            resolveBridgeJson(event.id, result.status, result.body);
          } else {
            failBridgeRequest(event.id, 500, "expected_json");
          }
          if (route === "/v1/bye") {
            await stopLanBridge();
            await clearBridgeSession();
          }
        } catch (error) {
          failBridgeRequest(event.id, 500, error instanceof Error ? error.message : "bridge");
        }
      })();
    });
    const unlinked = addBridgeUnlinkedListener(() => {
      void dropLink();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        await syncNativeLink();
        const link = getBridgeLink();
        if (isBridgeUnlinked() && !link?.tuiSeen) await dropLink();
      })();
    });
    const claimed = addBridgeClaimedListener((event) => {
      void (async () => {
        if (event.token) await saveBridgeToken(event.token);
        if (event.desktopHost) await saveDesktopHost(event.desktopHost);
      })();
    });
    return () => {
      sub.remove();
      unlinked.remove();
      claimed.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready || !isLanBridgeAvailable) return;
    let cancelled = false;
    void (async () => {
      const token = await loadBridgeToken();
      if (cancelled) return;
      try {
        if (!token) {
          await startLanBridge(BRIDGE_PORT, "", false);
          if (!cancelled) await syncNativeLink();
          return;
        }
        const started = await startLanBridge(BRIDGE_PORT, token, true);
        if (cancelled) return;
        if (started.running === false) await clearBridgeSession();
        await syncNativeLink();
      } catch (error) {
        console.warn("Lan bridge failed to start", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return children;
}
