import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { createHealthWebDatabase } from "./web-database";
export const BODY_WEB_DB = localDemoEnabled ? "nlc-body-photos-demo-v1" : "nlc-body-photos-v1";
export const healthWeb = createHealthWebDatabase(BODY_WEB_DB, AsyncStorage);
