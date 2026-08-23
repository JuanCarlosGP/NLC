const CURSOR_API = "https://api.cursor.com/v1";

export function cursorUpstreamUrl(path: string): string | null {
  const clean = path.trim();
  if (!clean.startsWith("/")) return null;
  if (clean.includes("://") || clean.includes("..")) return null;
  return `${CURSOR_API}${clean}`;
}

export async function relayCursorRequest(request: Request, path: string): Promise<Response> {
  const dest = cursorUpstreamUrl(path);
  if (!dest) return Response.json({ error: "Ruta Cursor no válida." }, { status: 400 });
  const auth = request.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Falta Authorization." }, { status: 401 });

  const headers = new Headers();
  headers.set("Authorization", auth);
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  const response = await fetch(dest, { method, headers, body });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function relayCursorFromRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).searchParams.get("p")?.trim();
  if (!path) return null;
  return relayCursorRequest(request, path);
}
