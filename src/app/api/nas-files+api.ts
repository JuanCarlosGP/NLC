import { t } from "@/lib/i18n/runtime";
import { relayCursorFromRequest } from "@/lib/cursor/proxy";
import { relayLanGet, relayLanRequest } from "@/lib/nas/lan-proxy";

export async function GET(request: Request) {
  const cursor = await relayCursorFromRequest(request);
  if (cursor) return cursor;
  const proxied = await relayLanGet(request);
  if (proxied) return proxied;
  return Response.json({ error: t("nasExtra.missingNasUrl") }, { status: 400 });
}

export async function POST(request: Request) {
  const cursor = await relayCursorFromRequest(request);
  if (cursor) return cursor;
  try {
    const payload = (await request.json()) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = (payload.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "PROPFIND", "PUT", "DELETE", "MKCOL"].includes(method)) {
      return Response.json({ error: t("nasExtra.methodNotAllowed") }, { status: 405 });
    }
    return await relayLanRequest(payload.url ?? "", method, payload.headers ?? {}, payload.body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t("nasExtra.nasProxyInvalid") },
      { status: 400 },
    );
  }
}
