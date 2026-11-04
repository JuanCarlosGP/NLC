import type { MobileMercury, MobileMercuryOptions, MobileMercuryState } from "./mercury-mobile";
export type MobileMercuryHookOptions = Pick<MobileMercuryOptions, "current" | "save" | "allowAutomatic"> & { ready: boolean };
export type MobileMercuryConnection = Pick<MobileMercury, "configure" | "disconnect" | "sync" | "acceptPending" | "rejectPending" | "retryStorage"> & { state: MobileMercuryState };
