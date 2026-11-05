import { coordinatedHealthStore } from "../access";
import { getDb } from "@/lib/db/client";
import { createSqlMedicationStore } from "./store";
export const medicationStore = coordinatedHealthStore(createSqlMedicationStore(getDb));
