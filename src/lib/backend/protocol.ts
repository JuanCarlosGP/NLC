export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Versions = Record<string, number>;
export type Command = { protocol: 1; bundleId: string; requestId: string; operation: string; args: unknown[]; expectedVersion?: number; expectedDomainVersion?: number };
export type Reply<T = unknown> = { data: T; versions: Versions };
export type Bootstrap = { protocol: 1; version: string; bundleId: string; clock: number; timeZone: string; preferences: { theme: string; locale: string }; presentation?: Record<string, string>; capabilities: { localFolders: false; devicePermissions: false; desktopServers: false; camera: false; updates: false }; desktop: { running: boolean; tuiRunning: boolean; port: number; lanAddress: string } };
export class BackendError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); this.name = "BackendError"; }
}
export type OperationOptions = { domain: string; write?: boolean; atomic?: boolean; phoneOnly?: boolean; key?: (args: any[]) => string };
export interface NlcBackend { invoke<T>(operation: string, args: unknown[], options: OperationOptions, local?: () => Promise<T>): Promise<T> }
