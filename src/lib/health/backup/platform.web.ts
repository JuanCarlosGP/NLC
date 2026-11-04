import type { CatalogDb } from "@/lib/db/types";
import * as Crypto from "expo-crypto";
import { runInTransaction } from "@/lib/db/client";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { registerHealthRecovery } from "../access";
import { healthWeb } from "../web-storage";
import { createWebBackupAdapter } from "./web-adapter";
let connection: Promise<CatalogDb> | null = null;
async function open() { return connection ??= import("@/lib/db/sqlite-client").then((module) => module.openIsolatedHealthDb()).catch((error) => { connection = null; throw error; }); }
const platform = createWebBackupAdapter(healthWeb.open, healthWeb.storage, localDemoEnabled ? { open, transact: runInTransaction } : undefined);
registerHealthRecovery(platform.recover);
export const backupAdapter = platform.adapter;
export const newBackupId = () => Crypto.randomUUID();
