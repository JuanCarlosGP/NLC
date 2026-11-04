import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { MAX_SNAPSHOT_BYTES } from "./model";
export async function saveIntegrationCopy(text:string,name:string):Promise<boolean>{const file=new File(Paths.cache,name);file.write(text);try{if(!(await Sharing.isAvailableAsync()))throw new Error("storage");await Sharing.shareAsync(file.uri,{mimeType:"application/json",dialogTitle:name});return true;}finally{if(file.exists)file.delete();}}
export async function pickIntegrationCopy():Promise<string|null>{const result=await DocumentPicker.getDocumentAsync({type:["application/json","text/plain"],copyToCacheDirectory:true});if(result.canceled)return null;const file=new File(result.assets[0].uri);try{if(file.size>MAX_SNAPSHOT_BYTES)throw new Error("size");return await file.text();}finally{if(file.exists)file.delete();}}
