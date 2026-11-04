import { MAX_SNAPSHOT_BYTES } from "./model";
export async function saveIntegrationCopy(text:string,name:string):Promise<boolean>{const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;}
export async function pickIntegrationCopy():Promise<string|null>{return new Promise((resolve,reject)=>{
  const input=document.createElement("input");input.type="file";input.accept=".json,application/json";input.style.display="none";document.body.appendChild(input);let settled=false;
  function finish(value:string|null,error?:unknown){if(settled)return;settled=true;input.remove();window.removeEventListener("focus",focused);if(error)reject(error);else resolve(value);}
  function focused(){setTimeout(()=>{if(!input.files?.length)finish(null);},1000);}
  input.addEventListener("cancel",()=>finish(null),{once:true});window.addEventListener("focus",focused);input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return finish(null);if(file.size>MAX_SNAPSHOT_BYTES)throw new Error("size");finish(await file.text());}catch(error){finish(null,error);}};input.click();
});}
