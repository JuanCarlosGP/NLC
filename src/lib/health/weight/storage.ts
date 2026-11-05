import { exposeStore } from "@/lib/backend/registry";
import { weightStore as local } from "./storage.impl";
export const weightStore = exposeStore("weight", local);
