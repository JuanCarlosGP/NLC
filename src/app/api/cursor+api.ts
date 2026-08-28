import { t } from "@/lib/i18n/runtime";
import { relayCursorFromRequest } from "@/lib/cursor/proxy";

export async function GET(request: Request) {
  return (await relayCursorFromRequest(request)) ?? Response.json({ error: t("nasExtra.missingP") }, { status: 400 });
}

export async function POST(request: Request) {
  return (await relayCursorFromRequest(request)) ?? Response.json({ error: t("nasExtra.missingP") }, { status: 400 });
}
