import * as Crypto from "expo-crypto";
import { withHealthLock } from "../access";
import { createHealthBackup } from "./core";
import { backupAdapter, newBackupId } from "./platform";
export const healthBackup = createHealthBackup(backupAdapter, async (bytes) => {
  const digest = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}, withHealthLock, newBackupId);
