import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createSqlMedicationStore } from "./store";
import { createWebMedicationStore } from "./web-store";
const local = coordinatedHealthStore(localDemoEnabled ? createSqlMedicationStore(getDb) : createWebMedicationStore(healthWeb.storage));

import { remoteEnabled } from "@/lib/backend/profile";
import { exposeStore } from "@/lib/backend/registry";
export const medicationStore: typeof local = remoteEnabled ? exposeStore("medication", local) : local;
