export type UploadProgress = {name:string;done:number;total:number;cancel():void};
let value: UploadProgress | null = null; const listeners=new Set<()=>void>();
export const uploadProgress = {getSnapshot:()=>value, subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}, set(next:UploadProgress|null){value=next;listeners.forEach(fn=>fn());}};
