import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createSqlMedicationStore } from "./store";
import { createWebMedicationStore } from "./web-store";
export const medicationStore = coordinatedHealthStore(localDemoEnabled ? createSqlMedicationStore(getDb) : createWebMedicationStore(healthWeb.storage));
