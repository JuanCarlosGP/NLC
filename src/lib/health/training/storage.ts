import { exposeStore } from "@/lib/backend/registry";
import { trainingStore as local } from "./storage.impl";
export const trainingStore = exposeStore("training", local);
