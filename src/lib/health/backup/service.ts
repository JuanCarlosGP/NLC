import { healthBackup as local } from "./service.local";
import { withExclusiveRestore } from "@/lib/backend/native";
export const healthBackup:typeof local={...local,restore:(...args)=>withExclusiveRestore(()=>local.restore(...args))};
