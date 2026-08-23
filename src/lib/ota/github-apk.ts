const GITHUB_RELEASE =
  "https://api.github.com/repos/JuanCarlosGP/SND/releases/tags/apk";
const GITHUB_LATEST = "https://api.github.com/repos/JuanCarlosGP/SND/releases/latest";

export const GITHUB_APK_DOWNLOAD =
  "https://github.com/JuanCarlosGP/SND/releases/latest/download/SND.apk";

export type RemoteApk = {
  version: string;
  versionCode: number | null;
  notes: string;
};

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part) || 0);
  const pb = b.split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isRemoteApkNewer(
  remote: RemoteApk,
  localVersion: string,
  localCode: number | null,
): boolean {
  if (remote.versionCode != null && localCode != null && localCode > 0) {
    return remote.versionCode > localCode;
  }
  return compareSemver(remote.version, localVersion) > 0;
}

function parseRelease(payload: {
  name?: string | null;
  tag_name?: string | null;
  body?: string | null;
}): RemoteApk | null {
  const title = `${payload.name ?? ""} ${payload.tag_name ?? ""} ${payload.body ?? ""}`;
  const named = title.match(/SND\s+(\d+\.\d+\.\d+)\s+\((\d+)\)/i);
  if (named) {
    return { version: named[1]!, versionCode: Number(named[2]), notes: payload.body?.trim() ?? "" };
  }
  const semver = title.match(/(\d+\.\d+\.\d+)/);
  if (!semver) return null;
  const code = title.match(/versionCode[^\d]*(\d+)/i);
  return {
    version: semver[1]!,
    versionCode: code ? Number(code[1]) : null,
    notes: payload.body?.trim() ?? "",
  };
}

async function readRelease(url: string): Promise<RemoteApk | null> {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return parseRelease((await response.json()) as { name?: string; tag_name?: string; body?: string });
}

export async function fetchRemoteApk(): Promise<RemoteApk | null> {
  const tagged = await readRelease(GITHUB_RELEASE);
  if (tagged) return tagged;
  return readRelease(GITHUB_LATEST);
}
