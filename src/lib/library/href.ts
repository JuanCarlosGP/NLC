import type { Href } from "expo-router";

/** Album/artist ids may contain colons; never put raw `/` in the path (SND-009). */
export function albumHref(id: string): Href {
  return { pathname: "/album/[id]", params: { id } };
}

export function artistHref(id: string): Href {
  return { pathname: "/artist/[id]", params: { id } };
}

export function taskHref(id: string): Href {
  return { pathname: "/task/[id]", params: { id } };
}

export function projectHref(id: string): Href {
  return { pathname: "/project/[id]", params: { id } };
}

export function assetHref(id: string): Href {
  return { pathname: "/wealth/asset/[id]", params: { id } };
}

export function libraryParamId(raw: string | string[] | undefined): string | undefined {
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw.join("/") : raw;
}
