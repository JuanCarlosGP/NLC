import { coordinatedHealthStore } from "../access";
import { getDb } from "@/lib/db/client";
import { createTrainingStore } from "./store";
export const trainingStore = coordinatedHealthStore(createTrainingStore(getDb));
