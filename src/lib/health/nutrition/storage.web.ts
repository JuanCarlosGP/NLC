import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb, runInTransaction } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createSqlNutritionStore } from "./store";
import { createWebNutritionStore } from "./web-store";
export const nutritionStore = coordinatedHealthStore(localDemoEnabled ? createSqlNutritionStore(getDb, runInTransaction) : createWebNutritionStore(healthWeb.storage));
