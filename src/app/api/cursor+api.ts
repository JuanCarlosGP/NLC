import { relayCursorFromRequest } from "@/lib/cursor/proxy";

export async function GET(request: Request) {
  return (await relayCursorFromRequest(request)) ?? Response.json({ error: "Falta p." }, { status: 400 });
}

export async function POST(request: Request) {
  return (await relayCursorFromRequest(request)) ?? Response.json({ error: "Falta p." }, { status: 400 });
}
