import { t } from "@/lib/i18n/runtime";
import { fetchTrackCoverMap } from "@/lib/spotify/track-covers";

const MAX_IDS = 120;
const TRACK_ID = /^[a-zA-Z0-9]{22}$/;

export async function POST(request: Request) {
  let ids: unknown;
  try {
    const body = (await request.json()) as { ids?: unknown };
    ids = body.ids;
  } catch {
    return Response.json({ error: t("nasExtra.bodyInvalid") }, { status: 400 });
  }
  if (!Array.isArray(ids)) {
    return Response.json({ error: t("nasExtra.missingIds") }, { status: 400 });
  }
  const clean = ids.filter((id): id is string => typeof id === "string" && TRACK_ID.test(id)).slice(0, MAX_IDS);
  const covers = await fetchTrackCoverMap(clean);
  return Response.json({ covers });
}
