import { coordinatedHealthStore } from "../access";
import { healthWeb } from "../web-storage";
import { getDb } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createTrainingStore } from "./store";
import { createWebTrainingStore } from "./web-store";
export const trainingStore = coordinatedHealthStore(localDemoEnabled ? createTrainingStore(getDb) : createWebTrainingStore(healthWeb.storage));
