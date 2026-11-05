import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createWeightStore } from "./store";
import { createWebWeightStore } from "./web-store";

const local = coordinatedHealthStore(localDemoEnabled ? createWeightStore(getDb) : createWebWeightStore(healthWeb.storage));

import { remoteEnabled } from "@/lib/backend/profile";
import { exposeStore } from "@/lib/backend/registry";
export const weightStore: typeof local = remoteEnabled ? exposeStore("weight", local) : local;
