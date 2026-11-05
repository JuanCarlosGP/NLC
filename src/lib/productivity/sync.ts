import * as local from "./sync.impl";
import { invokeBoundary } from "@/lib/backend/registry";
export * from "./sync.impl";
export const pullFocusFromSources: typeof local.pullFocusFromSources = (settings, password) => invokeBoundary("sync.focus.pull", [], { domain: "tasks", write: true, atomic: false }, () => local.pullFocusFromSources(settings, password));
export const pushFocusToSources: typeof local.pushFocusToSources = (settings, password) => invokeBoundary("sync.focus.push", [], { domain: "tasks", write: false, atomic: false }, () => local.pushFocusToSources(settings, password));
