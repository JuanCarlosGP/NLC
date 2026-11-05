import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createTrainingStore } from "./store";
import { createWebTrainingStore } from "./web-store";
const local = coordinatedHealthStore(localDemoEnabled ? createTrainingStore(getDb) : createWebTrainingStore(healthWeb.storage));

import { remoteEnabled } from "@/lib/backend/profile";
import { exposeStore } from "@/lib/backend/registry";
export const trainingStore: typeof local = remoteEnabled ? exposeStore("training", local) : local;
