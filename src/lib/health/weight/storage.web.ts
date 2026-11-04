import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createWeightStore } from "./store";
import { createWebWeightStore } from "./web-store";

export const weightStore = coordinatedHealthStore(localDemoEnabled ? createWeightStore(getDb) : createWebWeightStore(healthWeb.storage));
