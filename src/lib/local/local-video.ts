import { collateLocale, t } from "@/lib/i18n/runtime";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getWebDirectoryHandle } from "@/lib/local/pick-folder";
import { extOf, type WebDavEntry } from "@/lib/nas/webdav";
import type { PlayableSource } from "@/lib/nas/types";

export type LocalVideoShow = {
  path: string;
  name: string;
  kind: "series" | "movie";
  file?: boolean;
};

export const LOCAL_VIDEO_ROOT = "/local-video";
const VIDEO_EXT = new Set(["mp4", "mkv", "m4v", "webm", "avi", "mov"]);
const SKIP = new Set(["storyboards", "@eadir", "#recycle", "#snapshot", ".trash", "lost+found"]);

type LocalNode = {
  name: string;
  rel: string;
  uri: string;
  dir: boolean;
  children: LocalNode[];
};

let cached: { folderUri: string; root: LocalNode } | null = null;
const webUrls = new Map<string, string>();

function nameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split("/").pop() ?? decoded;
    return tail.replace(/^.*:/, "") || t("nasExtra.fileFallback");
  } catch {
    return t("nasExtra.fileFallback");
  }
}

export function isLocalVideoPath(path: string): boolean {
  const current = path.replace(/\/+$/, "") || "/";
  return current === LOCAL_VIDEO_ROOT || current.startsWith(`${LOCAL_VIDEO_ROOT}/`);
}

export function localVideoRel(path: string): string {
  const current = path.replace(/\/+$/, "");
  if (current === LOCAL_VIDEO_ROOT) return "";
  return current.slice(LOCAL_VIDEO_ROOT.length).replace(/^\/+/, "");
}

function davPath(rel: string): string {
  return rel ? `${LOCAL_VIDEO_ROOT}/${rel}` : LOCAL_VIDEO_ROOT;
}

function findNode(root: LocalNode, rel: string): LocalNode | null {
  if (!rel) return root;
  const parts = rel.split("/").filter(Boolean);
  let current: LocalNode = root;
  for (const part of parts) {
    const next = current.children.find((child) => child.name === part);
    if (!next) return null;
    current = next;
  }
  return current;
}

async function walkNative(uri: string, rel: string, depth: number): Promise<LocalNode> {
  const name = rel.split("/").filter(Boolean).at(-1) ?? "";
  const node: LocalNode = { name, rel, uri, dir: true, children: [] };
  if (depth > 8) return node;
  const { StorageAccessFramework } = FileSystem;
  let children: string[] = [];
  try {
    children = await StorageAccessFramework.readDirectoryAsync(uri);
  } catch {
    return node;
  }
  for (const child of children) {
    const childName = nameFromUri(child);
    if (SKIP.has(childName.toLowerCase()) || childName.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${childName}` : childName;
    if (VIDEO_EXT.has(extOf(childName))) {
      node.children.push({ name: childName, rel: childRel, uri: child, dir: false, children: [] });
      continue;
    }
    try {
      await StorageAccessFramework.readDirectoryAsync(child);
      node.children.push(await walkNative(child, childRel, depth + 1));
    } catch {
      // Not a folder we can open.
    }
  }
  return node;
}

async function walkWeb(
  handle: { name: string; kind: string; values: () => AsyncIterable<any> },
  rel: string,
  depth: number,
): Promise<LocalNode> {
  const name = rel.split("/").filter(Boolean).at(-1) ?? handle.name;
  const node: LocalNode = { name, rel, uri: `web:${rel || handle.name}`, dir: true, children: [] };
  if (depth > 8) return node;
  for await (const entry of handle.values()) {
    const childName = entry.name;
    if (SKIP.has(childName.toLowerCase()) || childName.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${childName}` : childName;
    if (entry.kind === "directory") {
      node.children.push(await walkWeb(entry, childRel, depth + 1));
      continue;
    }
    if (!VIDEO_EXT.has(extOf(childName))) continue;
    const file = await entry.getFile?.();
    if (!file) continue;
    const blobUrl = URL.createObjectURL(file);
    const uri = `web:${childRel}`;
    webUrls.set(davPath(childRel), blobUrl);
    node.children.push({ name: childName, rel: childRel, uri, dir: false, children: [] });
  }
  return node;
}

export async function loadLocalVideoTree(folderUri: string): Promise<LocalNode> {
  if (cached?.folderUri === folderUri) return cached.root;
  webUrls.clear();
  let root: LocalNode;
  if (Platform.OS === "web") {
    const handle = getWebDirectoryHandle(folderUri);
    root = handle
      ? await walkWeb(handle, "", 0)
      : { name: "", rel: "", uri: folderUri, dir: true, children: [] };
  } else {
    root = await walkNative(folderUri, "", 0);
  }
  cached = { folderUri, root };
  return root;
}

export function forgetLocalVideoTree(): void {
  cached = null;
  webUrls.clear();
}

export async function listLocalVideoDir(folderUri: string, path: string): Promise<WebDavEntry[]> {
  const root = await loadLocalVideoTree(folderUri);
  const node = findNode(root, localVideoRel(path));
  if (!node?.dir) return [];
  return node.children.map((child) => ({
    path: davPath(child.rel),
    name: child.name,
    dir: child.dir,
  }));
}

export async function localVideoPlayable(folderUri: string, path: string): Promise<PlayableSource> {
  if (Platform.OS === "web") {
    const url = webUrls.get(path.replace(/\/+$/, ""));
    if (url) return url;
  }
  const root = await loadLocalVideoTree(folderUri);
  const node = findNode(root, localVideoRel(path));
  if (!node || node.dir) throw new Error(t("nasExtra.localVideoMissing"));
  return { uri: node.uri };
}

function toShow(node: LocalNode, kind: LocalVideoShow["kind"], file = false): LocalVideoShow {
  return { path: davPath(node.rel), name: node.name, kind, file };
}

export async function listLocalVideoShows(folderUri: string): Promise<LocalVideoShow[]> {
  const root = await loadLocalVideoTree(folderUri);
  const seriesDir = root.children.find((child) => child.dir && child.name.toLowerCase() === "series");
  const moviesDir = root.children.find((child) => child.dir && child.name.toLowerCase() === "movies");
  const items: LocalVideoShow[] = [];
  if (seriesDir || moviesDir) {
    for (const child of seriesDir?.children ?? []) {
      if (child.dir) items.push(toShow(child, "series"));
    }
    for (const child of moviesDir?.children ?? []) {
      if (child.dir) items.push(toShow(child, "movie"));
      else if (VIDEO_EXT.has(extOf(child.name))) items.push(toShow(child, "movie", true));
    }
  } else {
    for (const child of root.children) {
      if (child.dir) items.push(toShow(child, "series"));
      else if (VIDEO_EXT.has(extOf(child.name))) items.push(toShow(child, "movie", true));
    }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, collateLocale()));
}
