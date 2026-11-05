export type TransferActivity={text:string;cancel():void;committing?:boolean};let value:TransferActivity|null=null;const listeners=new Set<()=>void>();
export const transferActivity={getSnapshot:()=>value,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},set(next:TransferActivity|null){value=next;listeners.forEach(fn=>fn());}};
