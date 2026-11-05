let active: object | null = null;
export function inBackendTransaction(connection?: object) {return active !== null && (connection === undefined || active === connection);}
export async function backendTransaction<T>(task:()=>Promise<T>,connection:object={}) {const previous=active;active=connection;try{return await task();}finally{active=previous;}}
