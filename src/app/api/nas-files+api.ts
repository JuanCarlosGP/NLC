import { relayLanGet, relayLanRequest } from "@/lib/nas/lan-proxy";

export async function GET(request: Request) {
  const proxied = await relayLanGet(request);
  if (proxied) return proxied;
  return Response.json({ error: "Falta la URL del NAS." }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = (payload.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "PROPFIND", "PUT", "DELETE"].includes(method)) {
      return Response.json({ error: "Método no permitido." }, { status: 405 });
    }
    return await relayLanRequest(payload.url ?? "", method, payload.headers ?? {}, payload.body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Proxy del NAS no válido." },
      { status: 400 },
    );
  }
}
