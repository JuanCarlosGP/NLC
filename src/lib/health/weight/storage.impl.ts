import { coordinatedHealthStore } from "../access";
import { getDb } from "@/lib/db/client";
import { createWeightStore } from "./store";

export const weightStore = coordinatedHealthStore(createWeightStore(getDb));
