import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb, runInTransaction } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createSqlNutritionStore } from "./store";
import { createWebNutritionStore } from "./web-store";
const local = coordinatedHealthStore(localDemoEnabled ? createSqlNutritionStore(getDb, runInTransaction) : createWebNutritionStore(healthWeb.storage));

import { remoteEnabled } from "@/lib/backend/profile";
import { exposeStore } from "@/lib/backend/registry";
import { nutritionUpload } from "@/lib/backend/nutrition-upload";
import { browserBackend } from "@/lib/backend/remote";
const remote = remoteEnabled ? exposeStore("nutrition", local) : local;
export const nutritionStore: typeof local = !remoteEnabled ? local : { ...remote, importDays: (incoming, replace = false) => {
 const id = nutritionUpload(incoming); return id ? browserBackend.invoke("nutrition.importCsv", [id, replace], { domain: "nutrition", write: true }) : remote.importDays(incoming, replace);
} };
