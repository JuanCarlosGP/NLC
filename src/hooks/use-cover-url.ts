import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings/settings-context";

export function useCoverUrl(coverId?: string | null): string | null {
  const { source } = useSettings();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!coverId) {
      setUri(null);
      return;
    }
    void source.coverUrl(coverId).then((next) => {
      if (!cancelled) setUri(next);
    });
    return () => {
      cancelled = true;
    };
  }, [coverId, source]);

  return uri;
}
