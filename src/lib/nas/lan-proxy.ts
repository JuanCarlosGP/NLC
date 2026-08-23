const LAN_HOST =
  /^(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})$/;

export function parseLanUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Solo HTTP/HTTPS en la LAN.");
  }
  if (!LAN_HOST.test(url.hostname)) {
    throw new Error("El destino tiene que ser una IP de la LAN.");
  }
  return url;
}

export async function relayLanRequest(
  rawUrl: string,
  method: string,
  incoming: Headers | Record<string, string>,
  body?: string,
): Promise<Response> {
  const url = parseLanUrl(rawUrl);
  const headers = new Headers();
  const source = incoming instanceof Headers ? incoming : new Headers(incoming);
  const auth = source.get("authorization");
  if (auth) headers.set("Authorization", auth);
  const depth = source.get("depth");
  if (depth) headers.set("Depth", depth);
  const contentType = source.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const overwrite = source.get("overwrite");
  if (overwrite) headers.set("Overwrite", overwrite);

  const upstream = await fetch(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
  const skip = new Set(["content-encoding", "transfer-encoding", "connection"]);
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!skip.has(key.toLowerCase())) out.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function relayLanGet(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (!target) return null;
  try {
    const headers = new Headers();
    const auth = request.headers.get("authorization");
    const token = url.searchParams.get("a");
    if (auth) headers.set("Authorization", auth);
    else if (token) headers.set("Authorization", `Basic ${token}`);
    return await relayLanRequest(target, "GET", headers);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Proxy del NAS no válido." },
      { status: 400 },
    );
  }
}
