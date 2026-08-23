import { md5Hex } from "@/lib/crypto/md5";
import { basicAuthHeader } from "@/lib/nas/webdav";

type DigestChallenge = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
};

export type DavAuthSession = {
  authorization(method: string, url: string): string;
  fetch(url: string, method: string, send: (authorization: string) => Promise<Response>): Promise<Response>;
};

export function createDavAuthSession(username: string, password: string): DavAuthSession {
  const basic = basicAuthHeader(username, password);
  let challenge: DigestChallenge | null = null;
  let nc = 0;

  function authorization(method: string, url: string): string {
    if (!challenge) return basic;
    return digestHeader(username, password, method, requestUri(url), challenge, ++nc);
  }

  async function fetchWithAuth(
    url: string,
    method: string,
    send: (authorization: string) => Promise<Response>,
  ): Promise<Response> {
    let response = await send(authorization(method, url));
    if (response.status !== 401) return response;
    let next = parseDigestChallenge(response.headers.get("www-authenticate") ?? "");
    if (!next) {
      const probe = await send("");
      next = parseDigestChallenge(probe.headers.get("www-authenticate") ?? "");
    }
    if (!next) return response;
    challenge = next;
    nc = 0;
    return send(authorization(method, url));
  }

  return { authorization, fetch: fetchWithAuth };
}

function requestUri(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function parseDigestChallenge(header: string): DigestChallenge | null {
  const start = header.search(/digest\s/i);
  if (start < 0) return null;
  const params: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  re.lastIndex = start;
  while ((match = re.exec(header))) {
    params[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  if (!params.realm || !params.nonce) return null;
  const qop = params.qop
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .find((item) => item === "auth");
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
  };
}

function digestHeader(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: DigestChallenge,
  ncValue: number,
): string {
  const nc = ncValue.toString(16).padStart(8, "0");
  const cnonce = randomCnonce();
  const algorithm = (challenge.algorithm ?? "MD5").toUpperCase();
  let ha1 = md5Hex(`${username}:${challenge.realm}:${password}`);
  if (algorithm.includes("SESS")) {
    ha1 = md5Hex(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = md5Hex(`${method}:${uri}`);
  const qop = challenge.qop;
  const response = qop
    ? md5Hex(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5Hex(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username="${escapeParam(username)}"`,
    `realm="${escapeParam(challenge.realm)}"`,
    `nonce="${escapeParam(challenge.nonce)}"`,
    `uri="${escapeParam(uri)}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${escapeParam(challenge.opaque)}"`);
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  return `Digest ${parts.join(", ")}`;
}

function escapeParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function randomCnonce(): string {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
