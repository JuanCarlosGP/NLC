import { exposeStore } from "@/lib/backend/registry";
import { medicationStore as local } from "./storage.impl";
export const medicationStore = exposeStore("medication", local);
