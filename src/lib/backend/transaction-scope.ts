// Only entered by the serialized native facade. Nested domain transactions join its transaction.
let active = false;
export function inBackendTransaction() { return active; }
export async function backendTransaction<T>(task: () => Promise<T>): Promise<T> { active = true; try { return await task(); } finally { active = false; } }
