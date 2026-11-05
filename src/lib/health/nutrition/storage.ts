import { exposeStore } from "@/lib/backend/registry";
import { nutritionStore as local } from "./storage.impl";
export const nutritionStore = exposeStore("nutrition", local);
