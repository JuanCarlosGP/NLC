import { exposeStore } from "@/lib/backend/registry";
import { bodyStore as local } from "./storage.impl";
export const bodyStore = exposeStore("body", local);
