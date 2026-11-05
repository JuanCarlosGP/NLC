import * as local from "./fetch-track-cover.impl";
import { expose } from "@/lib/backend/registry";
export * from "./fetch-track-cover.impl";
export const findCoverForTrack: typeof local.findCoverForTrack = expose("artwork.findCoverForTrack", local.findCoverForTrack, { domain: "catalog", atomic: false });
