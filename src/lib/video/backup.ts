import type { VideoWatchEntry } from "./watch-history";
import type { VideoFavorite } from "./favorites";
import { encodeVideoPath } from "./catalog";
import { seriesFromPath } from "./browse";
export function mapVideoBackup(
  preferences: Record<string, unknown>,
  roots: { from: string; to: string }[],
  relativePaths: Record<string, string> = {},
) {
  const watch = (preferences.watch as VideoWatchEntry[]) ?? [],
    likes = (preferences.likes as VideoFavorite[]) ?? [];
  const ordered = [...roots].sort((a, b) => b.from.length - a.from.length);
  function logical(value: string): string | null {
    for (const root of ordered)
      if (
        value === root.from ||
        value.startsWith(root.from === "/" ? "/" : `${root.from}/`)
      )
        return `${root.to}${value === root.from ? "" : `/${value.slice(root.from.length).replace(/^\/+/, "")}`}`;
    return null;
  }
  const wanted = new Set(
    [
      ...watch.flatMap((row) => [row.path, row.arcPath, row.sagaPath]),
      ...likes.map((row) => row.path),
    ]
      .map(logical)
      .filter((path): path is string => path !== null),
  );
  const aliases = new Map<string, string>();
  for (const [entry, actual] of Object.entries(relativePaths)) {
    const before = entry.slice("media/".length).split("/"),
      after = actual.split("/");
    let prefix = "";
    for (let index = 0; index < before.length; index++) {
      prefix = prefix ? `${prefix}/${before[index]}` : before[index];
      if (wanted.has(prefix))
        aliases.set(prefix, after.slice(0, index + 1).join("/"));
    }
  }
  function path(value: string) {
    const source = logical(value);
    return source === null
      ? value
      : `/local-video/${relativePaths[`media/${source}`] ?? aliases.get(source) ?? source}`;
  }
  return {
    watch: watch.map((row) => {
      const next = path(row.path);
      return {
        ...row,
        path: next,
        arcPath: path(row.arcPath),
        sagaPath: path(row.sagaPath),
        seriesId: next === row.path ? row.seriesId : seriesFromPath(next).id,
      };
    }),
    likes: likes.map((row) => ({
      ...row,
      path: path(row.path),
      id: encodeVideoPath(path(row.path)),
    })),
  };
}
