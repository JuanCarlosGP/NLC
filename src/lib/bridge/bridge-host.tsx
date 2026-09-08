import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  addBridgeRequestListener,
  failBridgeRequest,
  isLanBridgeAvailable,
  resolveBridgeJson,
  resolveBridgeStream,
  startLanBridge,
} from "nlc-lan-bridge";
import { handleBridgeRequest } from "@/lib/bridge/handle-request";
import { BRIDGE_PORT, loadBridgeToken } from "@/lib/bridge/session";
import { useSettings } from "@/lib/settings/settings-context";

export function BridgeHost({ children }: { children: ReactNode }) {
  const { source, ready } = useSettings();
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    if (!isLanBridgeAvailable) return;
    const sub = addBridgeRequestListener((event) => {
      void (async () => {
        try {
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
        } catch (error) {
          failBridgeRequest(event.id, 500, error instanceof Error ? error.message : "bridge");
        }
      })();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !isLanBridgeAvailable) return;
    let cancelled = false;
    void (async () => {
      const token = await loadBridgeToken();
      if (!token || cancelled) return;
      try {
        await startLanBridge(BRIDGE_PORT, token);
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
