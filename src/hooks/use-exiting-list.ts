import { useEffect, useRef, useState } from "react";

export const LIST_EXIT_MS = 220;

export function useExitingList<T extends { id: string }>(items: T[], durationMs = LIST_EXIT_MS) {
  const [render, setRender] = useState<{ rows: T[]; exiting: readonly string[] }>({
    rows: items,
    exiting: [],
  });
  const latestItems = useRef(items);
  latestItems.current = items;
  const idsKey = items.map((item) => item.id).join("\0");
  const prevKey = useRef(idsKey);

  useEffect(() => {
    if (idsKey === prevKey.current) {
      setRender((current) => {
        if (current.exiting.length) return current;
        return current.rows === items ? current : { rows: items, exiting: [] };
      });
      return;
    }

    const nextIds = new Set(items.map((item) => item.id));
    const prevIds = prevKey.current.split("\0").filter(Boolean);
    const removed = prevIds.filter((id) => !nextIds.has(id));

    if (!removed.length) {
      prevKey.current = idsKey;
      setRender({ rows: items, exiting: [] });
      return;
    }

    setRender((current) => {
      const rows: T[] = [];
      const seen = new Set<string>();
      for (const row of current.rows) {
        if (nextIds.has(row.id)) {
          rows.push(items.find((item) => item.id === row.id) ?? row);
          seen.add(row.id);
        } else if (removed.includes(row.id)) {
          rows.push(row);
          seen.add(row.id);
        }
      }
      for (const item of items) {
        if (!seen.has(item.id)) rows.push(item);
      }
      return { rows, exiting: removed };
    });

    const handle = setTimeout(() => {
      prevKey.current = latestItems.current.map((item) => item.id).join("\0");
      setRender({ rows: latestItems.current, exiting: [] });
    }, durationMs);
    return () => clearTimeout(handle);
  }, [durationMs, idsKey, items]);

  return {
    items: render.rows,
    isExiting: (id: string) => render.exiting.includes(id),
  };
}
