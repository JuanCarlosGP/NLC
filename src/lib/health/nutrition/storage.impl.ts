import { coordinatedHealthStore } from "../access";
import { getDb, runInTransaction } from "@/lib/db/client";
import { createSqlNutritionStore } from "./store";
export const nutritionStore = coordinatedHealthStore(createSqlNutritionStore(getDb, runInTransaction));
