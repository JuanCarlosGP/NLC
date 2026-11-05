import * as local from "./sync.impl";
import { invokeBoundary } from "@/lib/backend/registry";
export * from "./sync.impl";
export const pullWealthFromSources: typeof local.pullWealthFromSources = (settings, password) => invokeBoundary("sync.wealth.pull", [], { domain: "wealth", write: true, atomic: false }, () => local.pullWealthFromSources(settings, password));
export const pushWealthToSources: typeof local.pushWealthToSources = (settings, password) => invokeBoundary("sync.wealth.push", [], { domain: "wealth", write: false, atomic: false }, () => local.pushWealthToSources(settings, password));
